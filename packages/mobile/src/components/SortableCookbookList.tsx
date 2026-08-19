import type { Cookbook } from '@recipe-aggregator/shared';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  type GestureResponderHandlers,
  PanResponder,
  RefreshControl,
  ScrollView,
  View,
} from 'react-native';
import CookbookRow from '@/components/CookbookRow';
import { haptics } from '@/lib/haptics';
import { useTheme } from '@/lib/theme';

export type SortableCookbook = Cookbook & { recipeCount: number; coverImages: string[] };

// Drag-to-reorder for the shelves — the native half of the web app's @dnd-kit
// list. Built on RN's own Animated + PanResponder so it stays safe in Expo Go
// (no reanimated/worklets babel setup, same call as DragToDay).
//
// How it hangs together:
//   • The whole row is the handle. Rest a finger on it and it lifts onto a
//     cream sheet; move and it follows, while the shelves it passes slide
//     aside to open the slot. A plain tap still opens the cookbook.
//   • Every shelf row is exactly the same height, so one measurement turns the
//     finger's travel into an index — no per-row measuring mid-gesture.
//   • On release the card springs onto its slot, then the order commits and
//     every offset zeroes in the same tick, so nothing jumps at the swap.

/** Vertical rhythm between shelves. Must match the list's own gap. */
const GAP = 20;
/** How long a finger rests before the shelf lifts. */
const HOLD = 260;
/** How close to the top/bottom of the screen before the list scrolls itself. */
const EDGE = 110;
/** Auto-scroll step and cadence. */
const STEP = 14;
const TICK = 32;

function arrayMove<T>(list: T[], from: number, to: number): T[] {
  const next = list.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

interface Props {
  cookbooks: SortableCookbook[];
  onOpen: (id: string) => void;
  /** Fired once, on drop, with the whole list in its new order. */
  onReorder: (next: SortableCookbook[]) => void;
  header: ReactNode;
  /** Rendered as the last item of the gapped column, below the shelves. */
  footer: ReactNode;
  refreshing: boolean;
  onRefresh: () => void;
}

export default function SortableCookbookList({
  cookbooks,
  onOpen,
  onReorder,
  header,
  footer,
  refreshing,
  onRefresh,
}: Props) {
  const t = useTheme();
  const [activeId, setActiveId] = useState<string | null>(null);

  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  const startScrollY = useRef(0);
  const rowH = useRef(0);
  const lastDy = useRef(0);
  const lastPageY = useRef(0);
  const fromIndex = useRef(-1);
  const toIndex = useRef(-1);
  const dragging = useRef(false);
  const armedId = useRef<string | null>(null);
  const autoDir = useRef(0);
  const autoTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const dragY = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(0)).current;
  const offsets = useRef(new Map<string, Animated.Value>()).current;

  // Latest props, read from inside gesture callbacks so the pan responders
  // never need rebuilding mid-list.
  const itemsRef = useRef(cookbooks);
  itemsRef.current = cookbooks;
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;

  const offsetFor = useCallback(
    (id: string) => {
      let v = offsets.get(id);
      if (!v) {
        v = new Animated.Value(0);
        offsets.set(id, v);
      }
      return v;
    },
    [offsets],
  );

  const stopAuto = useCallback(() => {
    autoDir.current = 0;
    if (autoTimer.current) {
      clearInterval(autoTimer.current);
      autoTimer.current = null;
    }
  }, []);

  useEffect(() => () => stopAuto(), [stopAuto]);

  /** Position the carried card and work out which slot it is hovering. */
  const apply = useCallback(() => {
    if (!dragging.current) return;
    // Scrolling moves the content under a still finger, so it counts as travel.
    const shift = lastDy.current + (scrollY.current - startScrollY.current);
    dragY.setValue(shift);

    const slot = rowH.current + GAP;
    if (slot <= GAP) return;

    const items = itemsRef.current;
    const from = fromIndex.current;
    const target = Math.max(0, Math.min(items.length - 1, from + Math.round(shift / slot)));
    if (target === toIndex.current) return;
    toIndex.current = target;
    haptics.select();

    // Everything between the shelf's old and new home steps one slot towards
    // the gap it left behind.
    items.forEach((cb, i) => {
      if (i === from) return;
      let to = 0;
      if (from < target && i > from && i <= target) to = -slot;
      else if (from > target && i >= target && i < from) to = slot;
      Animated.spring(offsetFor(cb.id), {
        toValue: to,
        useNativeDriver: false,
        speed: 20,
        bounciness: 6,
      }).start();
    });
  }, [dragY, offsetFor]);

  const autoScroll = useCallback(
    (pageY: number) => {
      const h = Dimensions.get('window').height;
      const dir = pageY > h - EDGE ? 1 : pageY < EDGE ? -1 : 0;
      if (dir === autoDir.current) return;
      stopAuto();
      if (dir === 0) return;
      autoDir.current = dir;
      autoTimer.current = setInterval(() => {
        scrollRef.current?.scrollTo({ y: Math.max(0, scrollY.current + dir * STEP), animated: false });
        apply();
      }, TICK);
    },
    [apply, stopAuto],
  );

  /** The hold landed: lift the shelf so it is clearly in hand. */
  const arm = useCallback(
    (id: string) => {
      if (dragging.current) return;
      armedId.current = id;
      setActiveId(id);
      haptics.medium();
      Animated.spring(lift, { toValue: 1, useNativeDriver: false, speed: 20, bounciness: 10 }).start();
    },
    [lift],
  );

  /** Let go without moving — put it straight back down. */
  const disarm = useCallback(
    (id: string) => {
      // Starting the drag steals the touch from the row's Pressable, which
      // reports a press-out just before the pan responder is granted. Decide on
      // the next tick, once we know which of the two happened.
      setTimeout(() => {
        if (dragging.current || armedId.current !== id) return;
        armedId.current = null;
        setActiveId(null);
        Animated.spring(lift, { toValue: 0, useNativeDriver: false, speed: 22, bounciness: 0 }).start();
      }, 0);
    },
    [lift],
  );

  const begin = useCallback((id: string) => {
    const index = itemsRef.current.findIndex((c) => c.id === id);
    if (index === -1) return;
    dragging.current = true;
    fromIndex.current = index;
    toIndex.current = index;
    startScrollY.current = scrollY.current;
    lastDy.current = 0;
    dragY.setValue(0);
  }, [dragY]);

  const release = useCallback(() => {
    stopAuto();
    armedId.current = null;

    const items = itemsRef.current;
    const from = fromIndex.current;
    const to = toIndex.current;
    const slot = rowH.current + GAP;

    const settle = () => {
      // Zero every transform and swap the order in the same tick: the row is
      // already sitting in its new home when the offsets clear.
      dragY.setValue(0);
      lift.setValue(0);
      offsets.forEach((v) => v.setValue(0));
      dragging.current = false;
      fromIndex.current = -1;
      toIndex.current = -1;
      setActiveId(null);
      if (from !== -1 && to !== -1 && to !== from) onReorderRef.current(arrayMove(items, from, to));
    };

    if (!dragging.current || from === -1) {
      settle();
      return;
    }

    if (to === from) haptics.light();
    else haptics.success();

    Animated.spring(lift, { toValue: 0, useNativeDriver: false, speed: 20, bounciness: 0 }).start();
    Animated.spring(dragY, {
      toValue: (to - from) * slot,
      useNativeDriver: false,
      speed: 18,
      bounciness: 5,
    }).start(settle);
  }, [dragY, lift, offsets, stopAuto]);

  // One responder per row, built once — the callbacks above read live state
  // from refs, so they never go stale.
  const handlers = useRef(new Map<string, GestureResponderHandlers>()).current;
  const responderFor = useCallback(
    (id: string) => {
      let h = handlers.get(id);
      if (!h) {
        const ready = () => armedId.current === id && !dragging.current;
        h = PanResponder.create({
          // Never claim on touch-down: taps must still reach the row, and an
          // early move must still scroll the list.
          onStartShouldSetPanResponderCapture: () => false,
          onStartShouldSetPanResponder: () => false,
          onMoveShouldSetPanResponderCapture: ready,
          onMoveShouldSetPanResponder: ready,
          onPanResponderTerminationRequest: () => false,
          onShouldBlockNativeResponder: () => true,
          onPanResponderGrant: () => begin(id),
          onPanResponderMove: (e, g) => {
            lastDy.current = g.dy;
            lastPageY.current = e.nativeEvent.pageY;
            apply();
            autoScroll(lastPageY.current);
          },
          onPanResponderRelease: release,
          onPanResponderTerminate: release,
        }).panHandlers;
        handlers.set(id, h);
      }
      return h;
    },
    [apply, autoScroll, begin, handlers, release],
  );

  return (
    <ScrollView
      ref={scrollRef}
      scrollEnabled={activeId === null}
      scrollEventThrottle={16}
      onScroll={(e) => {
        scrollY.current = e.nativeEvent.contentOffset.y;
      }}
      contentContainerStyle={{ paddingBottom: 24 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.green} />}
    >
      {header}

      <View style={{ gap: GAP }}>
        {cookbooks.map((cb, i) => {
          const active = activeId === cb.id;
          return (
            <Animated.View
              key={cb.id}
              {...responderFor(cb.id)}
              onLayout={(e) => {
                rowH.current = e.nativeEvent.layout.height;
              }}
              style={{
                zIndex: active ? 20 : 0,
                elevation: active ? 12 : 0,
                transform: [
                  { translateY: active ? dragY : offsetFor(cb.id) },
                  { scale: active ? lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.02] }) : 1 },
                ],
              }}
            >
              {active && (
                // The sheet the shelf is lifted onto. Inset outwards so it
                // reads as padding around the row without shifting any layout.
                <Animated.View
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    top: -12,
                    bottom: -12,
                    left: 4,
                    right: 4,
                    borderRadius: 6,
                    backgroundColor: t.card,
                    opacity: lift,
                    shadowColor: '#000',
                    shadowOpacity: 0.22,
                    shadowRadius: 20,
                    shadowOffset: { width: 0, height: 14 },
                  }}
                />
              )}
              <CookbookRow
                cookbook={cb}
                recipeCount={cb.recipeCount}
                coverImages={cb.coverImages}
                index={i}
                reorderable
                lifted={active}
                delayLongPress={HOLD}
                onLongPress={() => arm(cb.id)}
                onPressOut={() => disarm(cb.id)}
                onPress={() => onOpen(cb.id)}
              />
            </Animated.View>
          );
        })}

        {footer}
      </View>
    </ScrollView>
  );
}

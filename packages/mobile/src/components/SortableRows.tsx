import { Ionicons } from '@expo/vector-icons';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  type GestureResponderHandlers,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  PanResponder,
  ScrollView,
  type StyleProp,
  View,
  type ViewStyle,
} from 'react-native';
import { haptics } from '@/lib/haptics';
import { useTheme } from '@/lib/theme';

// Drag-to-reorder for the small editable lists inside a form — the native half
// of the web app's @dnd-kit rows, and the same RN Animated + PanResponder call
// as SortableCookbookList so it stays safe in Expo Go (no reanimated/worklets).
//
// Two things differ from the cookbook shelves:
//   • Drag starts from a grip, not from anywhere on the row. A form row is
//     already spoken for — tap opens its editor, and the field-by-field version
//     is wall-to-wall text inputs — so a dedicated handle is the only gesture
//     that doesn't fight something else. No hold delay: the grip is unambiguous.
//   • Rows are different heights (an ingredient line wraps, an open editor is
//     tall), so each one is measured and the drop slot worked out from the real
//     layout rather than from a single row height.

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = list.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * Move a row, and give it the category of whichever neighbour it landed next
 * to. For the lists the wizard edits: it never shows categories, so without
 * this the recipe page would group a moved row straight back where it came
 * from and the order you just set wouldn't be the order you got.
 */
export function moveAdoptingCategory<T extends { category?: string | null }>(
  list: T[],
  from: number,
  to: number,
): T[] {
  const next = moveItem(list, from, to);
  const neighbour = next[to - 1] ?? next[to + 1];
  if (neighbour) next[to] = { ...next[to], category: neighbour.category };
  return next;
}

/** How close to the top/bottom of the screen before the form scrolls itself. */
const EDGE = 120;
/** Auto-scroll step and cadence. */
const STEP = 12;
const TICK = 32;

export interface SortableScroll {
  ref: React.RefObject<ScrollView | null>;
  offset: React.RefObject<number>;
  lock: (locked: boolean) => void;
}

/**
 * Wires the form's own ScrollView up to the drag: spread `scrollProps` onto it
 * and hand `scroll` to <SortableRows>. Without it a drag still works, it just
 * can't reach past the fold.
 */
export function useSortableScroll() {
  const ref = useRef<ScrollView>(null);
  const offset = useRef(0);
  const [locked, setLocked] = useState(false);

  const scroll = useMemo<SortableScroll>(() => ({ ref, offset, lock: setLocked }), []);

  const scrollProps = {
    ref,
    // The list must sit still under a finger that is placing a row.
    scrollEnabled: !locked,
    scrollEventThrottle: 16,
    onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      offset.current = e.nativeEvent.contentOffset.y;
    },
  };

  return { scroll, scrollProps };
}

interface Props {
  count: number;
  /** Rendered for each position; `dragging` is true for the row in hand. */
  renderItem: (index: number, dragging: boolean) => ReactNode;
  /** Fired once, on drop, with the positions to swap. */
  onReorder: (from: number, to: number) => void;
  /** Fired as a drag starts — a chance to close an open row editor. */
  onDragStart?: () => void;
  /** Nothing to grab at this position — used for the row open for editing. */
  isLocked?: (index: number) => boolean;
  gap?: number;
  scroll?: SortableScroll;
  style?: StyleProp<ViewStyle>;
}

export default function SortableRows({
  count,
  renderItem,
  onReorder,
  onDragStart,
  isLocked,
  gap = 8,
  scroll,
  style,
}: Props) {
  const t = useTheme();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const heights = useRef<number[]>([]);
  const startOffset = useRef(0);
  const lastDy = useRef(0);
  const fromIndex = useRef(-1);
  const toIndex = useRef(-1);
  const dragging = useRef(false);
  const autoDir = useRef(0);
  const autoTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const dragY = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(0)).current;
  const offsets = useRef(new Map<number, Animated.Value>()).current;

  // Latest props, read from inside the gesture callbacks so the pan responders
  // never need rebuilding mid-list.
  const countRef = useRef(count);
  countRef.current = count;
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;
  const onDragStartRef = useRef(onDragStart);
  onDragStartRef.current = onDragStart;
  const lockedRef = useRef(isLocked);
  lockedRef.current = isLocked;
  const scrollRef = useRef(scroll);
  scrollRef.current = scroll;

  const offsetFor = useCallback(
    (index: number) => {
      let v = offsets.get(index);
      if (!v) {
        v = new Animated.Value(0);
        offsets.set(index, v);
      }
      return v;
    },
    [offsets],
  );

  /** Where a row rests, measured from the top of the list. */
  const topOf = useCallback(
    (index: number) => {
      const h = heights.current;
      let y = 0;
      for (let i = 0; i < index; i++) y += (h[i] ?? 0) + gap;
      return y;
    },
    [gap],
  );

  /** Where the carried row lands, once the list has closed up behind it. */
  const settleDelta = useCallback(
    (from: number, to: number) => {
      const h = heights.current;
      let y = 0;
      let seen = 0;
      for (let i = 0; i < countRef.current && seen < to; i++) {
        if (i === from) continue;
        y += (h[i] ?? 0) + gap;
        seen++;
      }
      return y - topOf(from);
    },
    [gap, topOf],
  );

  const stopAuto = useCallback(() => {
    autoDir.current = 0;
    if (autoTimer.current) {
      clearInterval(autoTimer.current);
      autoTimer.current = null;
    }
  }, []);

  useEffect(() => () => stopAuto(), [stopAuto]);

  /** Position the carried row and work out which slot it is hovering. */
  const apply = useCallback(() => {
    if (!dragging.current) return;
    const from = fromIndex.current;
    const h = heights.current;
    // Scrolling moves the form under a still finger, so it counts as travel.
    const shift = lastDy.current + ((scrollRef.current?.offset.current ?? 0) - startOffset.current);
    dragY.setValue(shift);

    // The slot the row is over: how many of the others it has passed the middle
    // of, measured in the layout they'd have with this row lifted out of it.
    const centre = topOf(from) + shift + (h[from] ?? 0) / 2;
    let y = 0;
    let target = 0;
    for (let i = 0; i < countRef.current; i++) {
      if (i === from) continue;
      if (y + (h[i] ?? 0) / 2 < centre) target++;
      y += (h[i] ?? 0) + gap;
    }

    if (target === toIndex.current) return;
    toIndex.current = target;
    haptics.select();

    // Everything between the row's old and new home steps one slot towards the
    // gap it left behind.
    const slot = (h[from] ?? 0) + gap;
    for (let i = 0; i < countRef.current; i++) {
      if (i === from) continue;
      let to = 0;
      if (from < target && i > from && i <= target) to = -slot;
      else if (from > target && i >= target && i < from) to = slot;
      Animated.spring(offsetFor(i), {
        toValue: to,
        useNativeDriver: false,
        speed: 20,
        bounciness: 6,
      }).start();
    }
  }, [dragY, gap, offsetFor, topOf]);

  const autoScroll = useCallback(
    (pageY: number) => {
      const view = scrollRef.current;
      if (!view) return;
      const h = Dimensions.get('window').height;
      const dir = pageY > h - EDGE ? 1 : pageY < EDGE ? -1 : 0;
      if (dir === autoDir.current) return;
      stopAuto();
      if (dir === 0) return;
      autoDir.current = dir;
      autoTimer.current = setInterval(() => {
        view.ref.current?.scrollTo({
          y: Math.max(0, view.offset.current + dir * STEP),
          animated: false,
        });
        apply();
      }, TICK);
    },
    [apply, stopAuto],
  );

  const begin = useCallback(
    (index: number) => {
      dragging.current = true;
      fromIndex.current = index;
      toIndex.current = index;
      startOffset.current = scrollRef.current?.offset.current ?? 0;
      lastDy.current = 0;
      dragY.setValue(0);
      setActiveIndex(index);
      scrollRef.current?.lock(true);
      onDragStartRef.current?.();
      haptics.medium();
      Animated.spring(lift, { toValue: 1, useNativeDriver: false, speed: 20, bounciness: 10 }).start();
    },
    [dragY, lift],
  );

  const release = useCallback(() => {
    stopAuto();
    scrollRef.current?.lock(false);

    const from = fromIndex.current;
    const to = toIndex.current;

    const settle = () => {
      // Zero every transform and commit the new order in the same tick: the row
      // is already sitting in its new home when the offsets clear.
      dragY.setValue(0);
      lift.setValue(0);
      offsets.forEach((v) => v.setValue(0));
      dragging.current = false;
      fromIndex.current = -1;
      toIndex.current = -1;
      setActiveIndex(null);
      if (from !== -1 && to !== -1 && to !== from) onReorderRef.current(from, to);
    };

    if (!dragging.current || from === -1) {
      settle();
      return;
    }

    if (to === from) haptics.light();
    else haptics.success();

    Animated.spring(lift, { toValue: 0, useNativeDriver: false, speed: 20, bounciness: 0 }).start();
    Animated.spring(dragY, {
      toValue: settleDelta(from, to),
      useNativeDriver: false,
      speed: 18,
      bounciness: 5,
    }).start(settle);
  }, [dragY, lift, offsets, settleDelta, stopAuto]);

  // One responder per position, built once — the callbacks above read live
  // state from refs, so they never go stale.
  const handlers = useRef(new Map<number, GestureResponderHandlers>()).current;
  const responderFor = useCallback(
    (index: number) => {
      let h = handlers.get(index);
      if (!h) {
        const ready = () => !dragging.current && !(lockedRef.current?.(index) ?? false);
        h = PanResponder.create({
          // The grip is a dedicated handle: claim the touch outright so the
          // row lifts the moment it's held, with no delay to guess at.
          onStartShouldSetPanResponder: ready,
          onStartShouldSetPanResponderCapture: ready,
          onMoveShouldSetPanResponder: ready,
          onPanResponderTerminationRequest: () => false,
          onShouldBlockNativeResponder: () => true,
          onPanResponderGrant: () => begin(index),
          onPanResponderMove: (e, g) => {
            lastDy.current = g.dy;
            apply();
            autoScroll(e.nativeEvent.pageY);
          },
          onPanResponderRelease: release,
          onPanResponderTerminate: release,
        }).panHandlers;
        handlers.set(index, h);
      }
      return h;
    },
    [apply, autoScroll, begin, handlers, release],
  );

  return (
    <View style={[{ gap }, style]}>
      {Array.from({ length: count }, (_, i) => {
        const active = activeIndex === i;
        const locked = isLocked?.(i) ?? false;
        return (
          <Animated.View
            key={i}
            onLayout={(e) => {
              heights.current[i] = e.nativeEvent.layout.height;
            }}
            style={{
              zIndex: active ? 20 : 0,
              elevation: active ? 12 : 0,
              transform: [
                { translateY: active ? dragY : offsetFor(i) },
                { scale: active ? lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.02] }) : 1 },
              ],
            }}
          >
            {active && (
              // The sheet the row is lifted onto. Inset outwards so it reads as
              // padding around the row without shifting any layout.
              <Animated.View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  top: -7,
                  bottom: -7,
                  left: -4,
                  right: -4,
                  borderRadius: 12,
                  backgroundColor: t.card,
                  opacity: lift,
                  shadowColor: '#000',
                  shadowOpacity: 0.2,
                  shadowRadius: 16,
                  shadowOffset: { width: 0, height: 10 },
                }}
              />
            )}
            <View style={{ flexDirection: 'row', alignItems: 'stretch', gap: 6 }}>
              <View
                {...(locked ? {} : responderFor(i))}
                hitSlop={{ top: 8, bottom: 8, left: 10, right: 4 }}
                accessible={!locked}
                accessibilityRole="button"
                accessibilityLabel={`Drag to reorder item ${i + 1}`}
                style={{
                  width: 22,
                  alignItems: 'center',
                  justifyContent: 'center',
                  // Kept in the layout even when there's nothing to grab, so
                  // opening a row for editing never nudges its content sideways.
                  opacity: locked ? 0 : active ? 1 : 0.45,
                }}
              >
                <Ionicons name="reorder-two" size={20} color={active ? t.green : t.muted} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>{renderItem(i, active)}</View>
            </View>
          </Animated.View>
        );
      })}
    </View>
  );
}

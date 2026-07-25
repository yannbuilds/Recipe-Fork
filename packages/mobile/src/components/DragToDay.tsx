import { Ionicons } from '@expo/vector-icons';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  PanResponder,
  type GestureResponderHandlers,
  type ScrollView,
  View,
} from 'react-native';
import { haptics } from '@/lib/haptics';
import { useTheme } from '@/lib/theme';

// Drag a meal onto any day of the week — the native half of the web app's
// @dnd-kit grid. Built on RN's own Animated + PanResponder so it stays safe in
// Expo Go (no reanimated/worklets babel setup, same call as PressableScale).
//
// How it hangs together:
//   • Every drop target registers its View via `zoneRef` and gets measured in
//     window coordinates the moment a drag starts, so the finger's pageY maps
//     straight onto a day.
//   • The grip owns the touch from the first pixel, so there's no long-press
//     wait and no wrestling with the ScrollView (which is frozen mid-drag and
//     auto-scrolled programmatically near the edges).
//   • On release the floating card springs onto the target row and fades,
//     while the move commits underneath it — that's the snap.

/** A day index (0 = Mon … 6 = Sun), or the no-day bucket. */
export type DropKey = number | 'none';

const CARD_HEIGHT = 56;
/** How close to the top/bottom of the screen before the list scrolls itself. */
const EDGE = 120;
/** Auto-scroll step and cadence. Two frames per tick keeps it a step behind
 *  onScroll rather than outrunning it (each tick works off the real offset). */
const STEP = 16;
const TICK = 32;

interface Zone {
  key: DropKey;
  y: number;
  height: number;
}

export interface DragToDay {
  /** The meal being dragged, or null. */
  activeId: string | null;
  /** The zone under the finger right now. */
  hover: DropKey | null;
  /** Freeze the ScrollView while a drag is in flight. */
  dragging: boolean;
  /** Ref for the screen's root View — the card is positioned inside it. */
  rootRef: React.RefObject<View | null>;
  /** Ref factory for a drop target: `ref={drag.zoneRef(3)}`. */
  zoneRef: (key: DropKey) => (node: View | null) => void;
  /** Wire to the ScrollView's onScroll so measured zones follow the content. */
  handleScroll: (y: number) => void;
  /** Builds the grip's pan handlers. Stable, so rows keep one responder each. */
  makeResponder: (entryId: string, from: DropKey) => GestureResponderHandlers;
  pan: Animated.ValueXY;
  lift: Animated.Value;
  fade: Animated.Value;
}

export function useDragToDay({
  scrollRef,
  onDrop,
}: {
  scrollRef: React.RefObject<ScrollView | null>;
  onDrop: (entryId: string, key: DropKey) => void;
}): DragToDay {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hover, setHover] = useState<DropKey | null>(null);

  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const lift = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;

  const rootRef = useRef<View | null>(null);
  const rootY = useRef(0);
  const zoneNodes = useRef(new Map<DropKey, View>()).current;
  const zones = useRef<Zone[]>([]);
  const scrollY = useRef(0);
  const draggingId = useRef<string | null>(null);
  const fromKey = useRef<DropKey | null>(null);
  const hoverRef = useRef<DropKey | null>(null);
  const autoDir = useRef(0);
  const autoTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;

  // The card lives in the screen's root View, so its coordinates are window
  // coordinates minus wherever that View starts.
  const measureRoot = useCallback(() => {
    rootRef.current?.measureInWindow((_x, y) => {
      rootY.current = y;
    });
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(measureRoot);
    return () => cancelAnimationFrame(frame);
  }, [measureRoot]);

  useEffect(() => () => {
    if (autoTimer.current) clearInterval(autoTimer.current);
  }, []);

  // One stable callback per zone, so React doesn't detach and reattach every
  // ref on each render of a drag.
  const zoneCallbacks = useRef(new Map<DropKey, (node: View | null) => void>()).current;
  const zoneRef = useCallback(
    (key: DropKey) => {
      let fn = zoneCallbacks.get(key);
      if (!fn) {
        fn = (node: View | null) => {
          if (node) zoneNodes.set(key, node);
          else zoneNodes.delete(key);
        };
        zoneCallbacks.set(key, fn);
      }
      return fn;
    },
    [zoneCallbacks, zoneNodes],
  );

  const measureZones = useCallback(() => {
    // One shared array: the async callbacks fill it in place, and the map's
    // insertion order (Mon → Sun → no day) keeps it top-to-bottom.
    const collected: Zone[] = [];
    zones.current = collected;
    zoneNodes.forEach((node, key) => {
      node.measureInWindow((_x, y, _w, height) => {
        collected.push({ key, y, height });
      });
    });
  }, [zoneNodes]);

  const zoneAt = useCallback((pageY: number): DropKey | null => {
    for (const z of zones.current) {
      if (pageY >= z.y && pageY < z.y + z.height) return z.key;
    }
    return null;
  }, []);

  const stopAuto = useCallback(() => {
    autoDir.current = 0;
    if (autoTimer.current) {
      clearInterval(autoTimer.current);
      autoTimer.current = null;
    }
  }, []);

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
      }, TICK);
    },
    [scrollRef, stopAuto],
  );

  const handleScroll = useCallback((y: number) => {
    const delta = y - scrollY.current;
    scrollY.current = y;
    // Content moved under the finger: shift the measured zones to match rather
    // than re-measuring eight views mid-gesture.
    if (draggingId.current && delta !== 0) {
      for (const z of zones.current) z.y -= delta;
    }
  }, []);

  const cardY = useCallback((pageY: number) => pageY - rootY.current - CARD_HEIGHT / 2, []);

  const begin = useCallback(
    (entryId: string, from: DropKey, pageY: number) => {
      draggingId.current = entryId;
      fromKey.current = from;
      setActiveId(entryId);
      haptics.medium();
      measureRoot();
      measureZones();
      // The no-day bucket only appears once a drag is in flight, so it isn't
      // mounted for that first pass — measure again after the render lands.
      requestAnimationFrame(measureZones);
      setTimeout(measureZones, 80);
      pan.setValue({ x: 0, y: cardY(pageY) });
      fade.setValue(1);
      lift.setValue(0);
      Animated.spring(lift, { toValue: 1, useNativeDriver: false, speed: 24, bounciness: 8 }).start();
      hoverRef.current = from;
      setHover(from);
    },
    [cardY, fade, lift, measureRoot, measureZones, pan],
  );

  const move = useCallback(
    (pageY: number) => {
      if (!draggingId.current) return;
      pan.setValue({ x: 0, y: cardY(pageY) });
      const key = zoneAt(pageY);
      if (key !== hoverRef.current) {
        hoverRef.current = key;
        setHover(key);
        if (key !== null) haptics.select();
      }
      autoScroll(pageY);
    },
    [autoScroll, cardY, pan, zoneAt],
  );

  const release = useCallback(() => {
    stopAuto();
    const entryId = draggingId.current;
    const key = hoverRef.current;
    const from = fromKey.current;
    draggingId.current = null;

    const clear = () => {
      setActiveId(null);
      setHover(null);
      hoverRef.current = null;
      fromKey.current = null;
    };

    if (!entryId) {
      clear();
      return;
    }

    const zone = zones.current.find((z) => z.key === key);
    const landed = key !== null && !!zone && key !== from;

    if (!landed) {
      // Dropped where it started, or on nothing: melt away, change nothing.
      haptics.light();
      Animated.timing(fade, { toValue: 0, duration: 160, useNativeDriver: false }).start(clear);
      return;
    }

    haptics.success();
    // Commit first, so the row is already in its new home when the card lands
    // on top of it and dissolves.
    onDropRef.current(entryId, key);
    Animated.spring(pan, {
      toValue: { x: 0, y: zone!.y - rootY.current + 6 },
      useNativeDriver: false,
      speed: 17,
      bounciness: 9,
    }).start();
    Animated.timing(fade, { toValue: 0, duration: 150, delay: 120, useNativeDriver: false }).start(clear);
  }, [fade, pan, stopAuto]);

  const makeResponder = useCallback(
    (entryId: string, from: DropKey) =>
      PanResponder.create({
        // The grip claims the touch immediately — no long-press guessing, and
        // the ScrollView never gets a chance to take over.
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: (e) => begin(entryId, from, e.nativeEvent.pageY),
        onPanResponderMove: (e) => move(e.nativeEvent.pageY),
        onPanResponderRelease: release,
        onPanResponderTerminate: release,
      }).panHandlers,
    [begin, move, release],
  );

  return useMemo(
    () => ({
      activeId,
      hover,
      dragging: activeId !== null,
      rootRef,
      zoneRef,
      handleScroll,
      makeResponder,
      pan,
      lift,
      fade,
    }),
    [activeId, hover, zoneRef, handleScroll, makeResponder, pan, lift, fade],
  );
}

/** The grab handle on a meal row. */
export function DragGrip({
  makeResponder,
  entryId,
  from,
  active,
}: {
  makeResponder: DragToDay['makeResponder'];
  entryId: string;
  from: DropKey;
  active: boolean;
}) {
  const t = useTheme();
  const handlers = useMemo(() => makeResponder(entryId, from), [makeResponder, entryId, from]);

  return (
    <View
      {...handlers}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 6 }}
      style={{ paddingVertical: 8, paddingRight: 2, opacity: active ? 1 : 0.45 }}
    >
      <Ionicons name="reorder-two-outline" size={17} color={active ? t.green : t.muted} />
    </View>
  );
}

/** The meal in the air. Rendered once, at the screen's root, above everything. */
export function DragFloater({ drag, children }: { drag: DragToDay; children: ReactNode }) {
  const t = useTheme();
  const { width } = Dimensions.get('window');

  if (!drag.activeId) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 16,
        top: 0,
        width: width - 32,
        opacity: drag.fade,
        transform: [
          { translateY: drag.pan.y },
          { scale: drag.lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] }) },
        ],
        paddingHorizontal: 12,
        paddingVertical: 9,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: t.green,
        backgroundColor: t.card,
        // A lifted card needs to read as lifted on both platforms.
        shadowColor: '#000',
        shadowOpacity: 0.22,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 12 },
        elevation: 12,
        zIndex: 60,
      }}
    >
      {children}
    </Animated.View>
  );
}

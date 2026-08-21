import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, PanResponder, type GestureResponderHandlers } from 'react-native';
import {
  SCREEN_ON_IDLE_MS,
  SCREEN_ON_NOTICE_MS,
  SCREEN_ON_POLL_MS,
  SCREEN_ON_PROMPT_MS,
  SCREEN_ON_PROMPT_SECONDS,
} from '@recipe-aggregator/shared/keepAwake';
import { haptics } from '@/lib/haptics';

export interface IdleScreenOff {
  /** The "still cooking?" prompt is up and counting down. */
  asking: boolean;
  /** Whole seconds left before the guard switches keep-awake off. */
  secondsLeft: number;
  /** The guard just switched keep-awake off — show the explaining notice. */
  turnedOff: boolean;
  /** "Yes, still cooking" — dismiss the prompt and re-arm the idle window. */
  confirm: () => void;
  /** "Switch it off now" — skip the countdown. */
  turnOffNow: () => void;
  /**
   * Spread onto the view wrapping the screen. These only *observe* touches —
   * every `shouldSet` handler returns false, so the responder is never claimed
   * and children (scrolling, taps, the drag-to-day gesture) behave normally.
   * It's the closest React Native has to the web's document-level listeners.
   */
  activityHandlers: GestureResponderHandlers;
}

/*
 * Dead-man's switch for "keep screen on" — the native twin of the web hook.
 *
 * While `active`, fifteen minutes with nobody touching the screen puts the
 * "still cooking?" prompt up; a minute later with still no answer, `onIdleOff`
 * fires and the caller releases the keep-awake lock. Touching the screen at
 * any point — including while the prompt is up — counts as an answer, so
 * picking the phone back up is enough.
 */
export function useIdleScreenOff(active: boolean, onIdleOff: () => void): IdleScreenOff {
  const [asking, setAsking] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(SCREEN_ON_PROMPT_SECONDS);
  const [turnedOff, setTurnedOff] = useState(false);

  const lastActivity = useRef(Date.now());
  // Ref'd so a fresh `onIdleOff` closure each render can't restart the timers.
  const idleOffRef = useRef(onIdleOff);
  useEffect(() => {
    idleOffRef.current = onIdleOff;
  });

  const noteActivity = useCallback(() => {
    lastActivity.current = Date.now();
    setAsking(false); // same-value setState bails out, so this is free when idle
  }, []);

  const confirm = useCallback(() => {
    haptics.light();
    noteActivity();
    setTurnedOff(false);
  }, [noteActivity]);

  const turnOffNow = useCallback(() => {
    haptics.light();
    setAsking(false);
    setTurnedOff(true);
    idleOffRef.current();
  }, []);

  // Touch observer. `*ShouldSetPanResponderCapture` runs before any child gets
  // a look in and returning false declines the gesture, so this sees every
  // touch on the screen without ever swallowing one.
  const activityHandlers = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponderCapture: () => {
          noteActivity();
          return false;
        },
        onMoveShouldSetPanResponderCapture: () => {
          noteActivity();
          return false;
        },
      }).panHandlers,
    [noteActivity],
  );

  // ── Watch for idleness while the lock is held ─────────────
  useEffect(() => {
    if (!active) {
      setAsking(false);
      return;
    }
    // Switching it on is itself an interaction, and clears any stale notice.
    lastActivity.current = Date.now();
    setAsking(false);
    setTurnedOff(false);

    // Coming back from the background counts — you've just picked the phone up.
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') noteActivity();
    });

    const poll = setInterval(() => {
      if (Date.now() - lastActivity.current >= SCREEN_ON_IDLE_MS) setAsking(true);
    }, SCREEN_ON_POLL_MS);

    return () => {
      sub.remove();
      clearInterval(poll);
    };
  }, [active, noteActivity]);

  // ── Countdown once the prompt is up ───────────────────────
  useEffect(() => {
    if (!asking) {
      setSecondsLeft(SCREEN_ON_PROMPT_SECONDS);
      return;
    }
    // A buzz, because the phone is probably across the kitchen by now.
    haptics.warning();
    const deadline = Date.now() + SCREEN_ON_PROMPT_MS;
    setSecondsLeft(SCREEN_ON_PROMPT_SECONDS);

    const id = setInterval(() => {
      const left = Math.ceil((deadline - Date.now()) / 1000);
      if (left > 0) {
        setSecondsLeft(left);
        return;
      }
      clearInterval(id);
      setSecondsLeft(0);
      setAsking(false);
      setTurnedOff(true);
      idleOffRef.current();
    }, 250);

    return () => clearInterval(id);
  }, [asking]);

  // ── Auto-hide the "switched off" notice ───────────────────
  useEffect(() => {
    if (!turnedOff) return;
    const id = setTimeout(() => setTurnedOff(false), SCREEN_ON_NOTICE_MS);
    return () => clearTimeout(id);
  }, [turnedOff]);

  return { asking, secondsLeft, turnedOff, confirm, turnOffNow, activityHandlers };
}

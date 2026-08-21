import { useCallback, useEffect, useRef, useState } from 'react';
import {
  SCREEN_ON_IDLE_MS,
  SCREEN_ON_NOTICE_MS,
  SCREEN_ON_POLL_MS,
  SCREEN_ON_PROMPT_MS,
  SCREEN_ON_PROMPT_SECONDS,
} from '@recipe-aggregator/shared';

/**
 * Marks the prompt's own DOM so the activity watcher ignores taps inside it.
 * Spread onto the banner's root element.
 */
export const GUARD_ATTR = 'data-screen-on-guard';

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
}

/*
 * Dead-man's switch for "keep screen on".
 *
 * While `active`, watches for deliberate interaction with the page. Fifteen
 * minutes without any → the prompt goes up; a minute later with still no
 * answer → `onIdleOff()` fires and the caller drops the wake lock.
 *
 * Deliberate is the operative word: pointer *moves* are ignored, so a nudged
 * trackpad or a passing cursor can't stand in for a cook. Anything that takes
 * intent — a tap, a key, a scroll, coming back to the tab — counts, including
 * while the prompt is up, so returning to the recipe answers it without
 * making you hunt for the button.
 */
export function useIdleScreenOff(active: boolean, onIdleOff: () => void): IdleScreenOff {
  const [asking, setAsking] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(SCREEN_ON_PROMPT_SECONDS);
  const [turnedOff, setTurnedOff] = useState(false);

  const lastActivity = useRef(Date.now());
  // Kept in a ref so `onIdleOff` can change identity every render without
  // restarting the countdown underneath the user.
  const idleOffRef = useRef(onIdleOff);
  useEffect(() => {
    idleOffRef.current = onIdleOff;
  });

  const noteActivity = useCallback((event?: Event) => {
    // Taps on the prompt itself don't count — its own buttons decide what
    // happens. Without this the banner unmounts on `pointerdown`, before the
    // click ever reaches "Turn off".
    const target = event?.target;
    if (target instanceof Element && target.closest(`[${GUARD_ATTR}]`)) return;
    lastActivity.current = Date.now();
    setAsking(false); // same-value setState bails out, so this is free when idle
  }, []);

  const confirm = useCallback(() => {
    lastActivity.current = Date.now();
    setAsking(false);
    setTurnedOff(false);
  }, []);

  const turnOffNow = useCallback(() => {
    setAsking(false);
    setTurnedOff(true);
    idleOffRef.current();
  }, []);

  // ── Watch for interaction while the lock is held ──────────
  useEffect(() => {
    if (!active) {
      setAsking(false);
      return;
    }
    // A fresh switch-on is itself an interaction, and clears any stale notice.
    lastActivity.current = Date.now();
    setAsking(false);
    setTurnedOff(false);

    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;
    events.forEach((e) =>
      window.addEventListener(e, noteActivity, { passive: true, capture: true }),
    );
    // Coming back to the tab counts too — and matters, because the browser
    // drops the wake lock while hidden and RecipeDetail re-takes it here.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') noteActivity();
    };
    document.addEventListener('visibilitychange', onVisibility);

    const poll = window.setInterval(() => {
      if (Date.now() - lastActivity.current >= SCREEN_ON_IDLE_MS) setAsking(true);
    }, SCREEN_ON_POLL_MS);

    return () => {
      events.forEach((e) => window.removeEventListener(e, noteActivity, { capture: true }));
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(poll);
    };
  }, [active, noteActivity]);

  // ── Countdown once the prompt is up ───────────────────────
  useEffect(() => {
    if (!asking) {
      setSecondsLeft(SCREEN_ON_PROMPT_SECONDS);
      return;
    }
    const deadline = Date.now() + SCREEN_ON_PROMPT_MS;
    setSecondsLeft(SCREEN_ON_PROMPT_SECONDS);

    const id = window.setInterval(() => {
      const left = Math.ceil((deadline - Date.now()) / 1000);
      if (left > 0) {
        setSecondsLeft(left);
        return;
      }
      window.clearInterval(id);
      setSecondsLeft(0);
      setAsking(false);
      setTurnedOff(true);
      idleOffRef.current();
    }, 250);

    return () => window.clearInterval(id);
  }, [asking]);

  // ── Auto-hide the "switched off" notice ───────────────────
  useEffect(() => {
    if (!turnedOff) return;
    const id = window.setTimeout(() => setTurnedOff(false), SCREEN_ON_NOTICE_MS);
    return () => window.clearTimeout(id);
  }, [turnedOff]);

  return { asking, secondsLeft, turnedOff, confirm, turnOffNow };
}

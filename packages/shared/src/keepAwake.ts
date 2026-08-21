/*
 * Keep-awake idle guard — shared timings.
 *
 * "Keep screen on" holds a wake lock so the phone/laptop doesn't sleep while
 * you cook. The failure mode is leaving it on: the recipe sits on the counter
 * and the battery drains. So the lock is armed with a dead-man's switch —
 * after a stretch with no interaction we ask "still cooking?", and if nobody
 * answers we let the screen sleep again.
 *
 * Both platforms import these so the behaviour can't drift apart.
 */

/** No interaction for this long while keep-awake is on → ask "still cooking?". */
export const SCREEN_ON_IDLE_MS = 15 * 60 * 1000;

/** No answer to that prompt within this long → switch keep-awake off. */
export const SCREEN_ON_PROMPT_MS = 60 * 1000;

/** Whole seconds shown on the prompt's countdown. */
export const SCREEN_ON_PROMPT_SECONDS = Math.round(SCREEN_ON_PROMPT_MS / 1000);

/** How long the "switched off to save battery" notice stays up afterwards. */
export const SCREEN_ON_NOTICE_MS = 12 * 1000;

/*
 * Idleness is measured by comparing timestamps on a slow poll rather than by
 * restarting a 15-minute timer on every scroll/tap: cheaper under a stream of
 * events, and immune to timers being throttled while the tab or app is
 * backgrounded (a throttled timer would otherwise under-count the idle time).
 */
export const SCREEN_ON_POLL_MS = 5 * 1000;

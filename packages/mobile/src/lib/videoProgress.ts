import {
  createVideoProgressSession,
} from '@recipe-aggregator/shared/videoProgress';

/*
 * Playback positions belong to this open app session. Module memory keeps a
 * separate mark for every recipe while navigation swaps screens, and resets
 * when the app process closes. Recipe screens and the cook-session context
 * explicitly clear entries when their lifecycle ends.
 */

/** What the thumbnail needs to know: where you got to, and how far through. */
export interface VideoMarkView {
  seconds: number;
  fraction: number | null;
}

export const NO_MARK: VideoMarkView = { seconds: 0, fraction: null };

const session = createVideoProgressSession();

export const beginVideoProgress = session.beginVideoProgress;
export const finishVideoProgress = session.finishVideoProgress;
export const forgetVideoMark = session.forgetVideoMark;
export const saveVideoMark = session.saveVideoMark;

export function loadVideoMark(recipeId: string): VideoMarkView {
  return {
    seconds: session.resumeAtFor(recipeId),
    fraction: session.watchedFractionFor(recipeId),
  };
}

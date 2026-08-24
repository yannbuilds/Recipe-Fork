import {
  createVideoProgressSession,
} from '@recipe-aggregator/shared';

/*
 * Playback positions belong to this open app session. Module memory keeps a
 * separate mark for every recipe while you switch between meals, but naturally
 * disappears when the tab/app is closed. Recipe screens and the cook-session
 * context explicitly clear entries when their lifecycle ends.
 */

export const {
  beginVideoProgress,
  finishVideoProgress,
  forgetVideoMark,
  resumeAtFor,
  saveVideoMark,
  watchedFractionFor,
} = createVideoProgressSession();

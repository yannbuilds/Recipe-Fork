import {
  VIDEO_PROGRESS_KEY,
  clearVideoProgress,
  markVideoProgress,
  parseVideoProgress,
  serializeVideoProgress,
  videoResumeAt,
  videoWatchedFraction,
  type VideoProgress,
} from '@recipe-aggregator/shared';

/*
 * The localStorage end of the video marks. The rules all live in shared —
 * this is just the plumbing, wrapped so private-mode Safari (which throws on
 * every localStorage touch) degrades to "the video doesn't resume" rather than
 * to a blank recipe page.
 */

function read(): VideoProgress {
  if (typeof window === 'undefined') return {};
  try {
    return parseVideoProgress(window.localStorage.getItem(VIDEO_PROGRESS_KEY));
  } catch {
    return {};
  }
}

function write(progress: VideoProgress) {
  try {
    window.localStorage.setItem(VIDEO_PROGRESS_KEY, serializeVideoProgress(progress));
  } catch {
    // Quota or private mode — carry on, it just won't resume next time.
  }
}

/** Seconds to start this video at, 0 for the top. */
export function resumeAtFor(videoId: string): number {
  return videoResumeAt(read(), videoId);
}

/** How far through, 0–1, for the watched bar under the thumbnail. Null if unknown. */
export function watchedFractionFor(videoId: string): number | null {
  return videoWatchedFraction(read(), videoId);
}

export function saveVideoMark(videoId: string, seconds: number, duration?: number | null) {
  write(markVideoProgress(read(), videoId, seconds, duration));
}

export function forgetVideoMark(videoId: string) {
  write(clearVideoProgress(read(), videoId));
}

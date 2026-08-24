/*
 * Where you'd got to in a recipe's video.
 *
 * Cooking from a video is a stop-start business: you play thirty seconds, close
 * it to chop something, come back, close it again to check the pan. The player
 * used to survive that by staying mounted forever, which is what made it pick up
 * where you left off — and also what broke fixed positioning on iOS, so it now
 * unmounts on close. This is the replacement: a tiny mark of the last position,
 * written on close and read on open, so the resume behaviour lives in an app
 * session rather than in a live iframe nobody can see.
 *
 * Callers key marks by recipe id. Two recipes can point at the same YouTube
 * video while being two separate meals on the stove, so their clocks must not
 * overwrite one another.
 *
 * Everything here is pure and platform-free. Web and mobile each keep the map
 * in module memory; the rules below are the only place they live, so the two
 * can't drift apart.
 */

/** How far into one video you got, and when. */
export interface VideoMark {
  /** Seconds from the start. */
  seconds: number;
  /** Total length, once the player has told us. Null until it has. */
  duration: number | null;
  updatedAt: string;
}

/** recipe id → mark. */
export type VideoProgress = Record<string, VideoMark>;

/**
 * Ignore sub-second clock noise while the player is booting. Once a real second
 * has played, preserve it: even a short close can be intentional in a kitchen.
 */
export const VIDEO_RESUME_MIN_SECONDS = 1;

/** Marks are tiny, but the store shouldn't grow forever. Oldest go first. */
export const VIDEO_PROGRESS_MAX_ENTRIES = 60;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Drop the oldest marks once there are more than we want to keep. */
function prune(progress: VideoProgress): VideoProgress {
  const ids = Object.keys(progress);
  if (ids.length <= VIDEO_PROGRESS_MAX_ENTRIES) return progress;
  const keep = ids
    .sort((a, b) => Date.parse(progress[b].updatedAt) - Date.parse(progress[a].updatedAt))
    .slice(0, VIDEO_PROGRESS_MAX_ENTRIES);
  const out: VideoProgress = {};
  for (const id of keep) out[id] = progress[id];
  return out;
}

/**
 * Note where the player got to.
 *
 * A transient zero is ignored rather than clearing an existing mark. YouTube
 * reports zero while a new player is initialising, and treating that as a real
 * position was the regression that made every reopen start from the beginning.
 * Explicit actions (Start over, video ended, recipe finished) clear the mark.
 */
export function markVideoProgress(
  progress: VideoProgress,
  recipeId: string,
  seconds: number,
  duration?: number | null,
  now = Date.now(),
): VideoProgress {
  if (!recipeId) return progress;
  const total = isFiniteNumber(duration) && duration > 0 ? duration : progress[recipeId]?.duration ?? null;

  if (!isFiniteNumber(seconds) || seconds < VIDEO_RESUME_MIN_SECONDS) {
    return progress;
  }

  return prune({
    ...progress,
    [recipeId]: { seconds, duration: total, updatedAt: new Date(now).toISOString() },
  });
}

export function clearVideoProgress(progress: VideoProgress, recipeId: string): VideoProgress {
  if (!(recipeId in progress)) return progress;
  const out = { ...progress };
  delete out[recipeId];
  return out;
}

/** The mark for one video, or null when there's nothing worth resuming from. */
export function videoMarkFor(
  progress: VideoProgress,
  recipeId: string | null | undefined,
): VideoMark | null {
  if (!recipeId) return null;
  return progress[recipeId] ?? null;
}

/** Seconds to start playback at — 0 when the video should start from the top. */
export function videoResumeAt(
  progress: VideoProgress,
  recipeId: string | null | undefined,
): number {
  const mark = videoMarkFor(progress, recipeId);
  if (!mark || mark.seconds < VIDEO_RESUME_MIN_SECONDS) return 0;
  return Math.floor(mark.seconds);
}

/** How far through, 0–1, for the watched bar under a thumbnail. Null if unknown. */
export function videoWatchedFraction(
  progress: VideoProgress,
  recipeId: string | null | undefined,
): number | null {
  const mark = videoMarkFor(progress, recipeId);
  if (!mark || mark.duration === null || mark.duration <= 0) return null;
  return Math.min(1, Math.max(0, mark.seconds / mark.duration));
}

/** One app-lifetime collection of recipe video clocks. */
export interface VideoProgressSession {
  beginVideoProgress: (recipeId: string) => void;
  resumeAtFor: (recipeId: string) => number;
  watchedFractionFor: (recipeId: string) => number | null;
  saveVideoMark: (recipeId: string, seconds: number, duration?: number | null) => void;
  forgetVideoMark: (recipeId: string) => void;
  finishVideoProgress: (recipeId: string) => void;
}

/**
 * Create the in-memory store used by one running web/mobile app.
 *
 * Finished recipes are briefly tombstoned: a player being torn down can emit a
 * final stale clock after the cook session has cleared it. The next deliberate
 * play begins a fresh clock and removes the tombstone.
 */
export function createVideoProgressSession(): VideoProgressSession {
  let progress: VideoProgress = {};
  const finishedRecipes = new Set<string>();

  const forgetVideoMark = (recipeId: string) => {
    progress = clearVideoProgress(progress, recipeId);
  };

  return {
    beginVideoProgress(recipeId) {
      finishedRecipes.delete(recipeId);
    },
    resumeAtFor(recipeId) {
      return videoResumeAt(progress, recipeId);
    },
    watchedFractionFor(recipeId) {
      return videoWatchedFraction(progress, recipeId);
    },
    saveVideoMark(recipeId, seconds, duration) {
      if (finishedRecipes.has(recipeId)) return;
      progress = markVideoProgress(progress, recipeId, seconds, duration);
    },
    forgetVideoMark,
    finishVideoProgress(recipeId) {
      finishedRecipes.add(recipeId);
      forgetVideoMark(recipeId);
    },
  };
}

/** `2:34` / `1:02:07`, for the "picking up at…" line. */
export function formatVideoTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** The 11-character id in a YouTube URL, or null if there isn't one. */
export function youTubeVideoId(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
  );
  return match?.[1] ?? null;
}

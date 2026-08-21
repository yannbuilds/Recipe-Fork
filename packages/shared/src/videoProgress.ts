/*
 * Where you'd got to in a recipe's video.
 *
 * Cooking from a video is a stop-start business: you play thirty seconds, close
 * it to chop something, come back, close it again to check the pan. The player
 * used to survive that by staying mounted forever, which is what made it pick up
 * where you left off — and also what broke fixed positioning on iOS, so it now
 * unmounts on close. This is the replacement: a tiny mark of the last position,
 * written on close and read on open, so the resume behaviour lives in storage
 * rather than in a live iframe nobody can see.
 *
 * Keyed by video id, not recipe id: two recipes pointing at the same video share
 * a place, which is the right answer when one is a fork of the other.
 *
 * Everything here is pure and platform-free. Web persists it to localStorage,
 * mobile to AsyncStorage; the rules below are the only place they live, so the
 * two can't drift apart.
 */

/** How far into one video you got, and when. */
export interface VideoMark {
  /** Seconds from the start. */
  seconds: number;
  /** Total length, once the player has told us. Null until it has. */
  duration: number | null;
  updatedAt: string;
}

/** video id → mark. */
export type VideoProgress = Record<string, VideoMark>;

/** Storage key, shared so web and mobile agree on where it lives. */
export const VIDEO_PROGRESS_KEY = 'pk-video-progress-v1';

/**
 * Below this, resuming is worse than starting over — you pressed play, thought
 * better of it, and would rather not rejoin four seconds in next time.
 */
export const VIDEO_RESUME_MIN_SECONDS = 5;

/**
 * Within this of the end it counts as watched, so the next open starts from the
 * top instead of dropping you on the outro.
 */
export const VIDEO_RESUME_END_PAD_SECONDS = 15;

/**
 * A mark older than this belongs to a meal you've long since eaten. Resuming
 * from it would be stranger than starting again.
 */
export const VIDEO_PROGRESS_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** Marks are tiny, but the store shouldn't grow forever. Oldest go first. */
export const VIDEO_PROGRESS_MAX_ENTRIES = 60;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Rehydrate whatever came out of storage.
 *
 * Same posture as the cook session: a half-written blob or a shape from an older
 * version comes back empty rather than throwing while you're mid-recipe.
 */
export function parseVideoProgress(
  raw: string | null | undefined,
  now = Date.now(),
): VideoProgress {
  if (!raw) return {};
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!data || typeof data !== 'object') return {};

  const out: VideoProgress = {};
  for (const [videoId, entry] of Object.entries(data as Record<string, unknown>)) {
    if (!videoId || !entry || typeof entry !== 'object') continue;
    const mark = entry as Partial<VideoMark>;
    if (!isFiniteNumber(mark.seconds) || mark.seconds <= 0) continue;
    const updatedAt = typeof mark.updatedAt === 'string' ? mark.updatedAt : new Date(now).toISOString();
    const updated = Date.parse(updatedAt);
    if (Number.isFinite(updated) && now - updated > VIDEO_PROGRESS_MAX_AGE_MS) continue;
    out[videoId] = {
      seconds: mark.seconds,
      duration: isFiniteNumber(mark.duration) && mark.duration > 0 ? mark.duration : null,
      updatedAt,
    };
  }
  return out;
}

export function serializeVideoProgress(progress: VideoProgress): string {
  return JSON.stringify(progress);
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
 * Positions that aren't worth resuming from — the first few seconds, or the last
 * few — clear the mark instead of storing one, so "watched it through" and
 * "opened it by accident" both leave you at the beginning next time.
 */
export function markVideoProgress(
  progress: VideoProgress,
  videoId: string,
  seconds: number,
  duration?: number | null,
  now = Date.now(),
): VideoProgress {
  if (!videoId) return progress;
  const total = isFiniteNumber(duration) && duration > 0 ? duration : progress[videoId]?.duration ?? null;

  if (!isFiniteNumber(seconds) || seconds < VIDEO_RESUME_MIN_SECONDS) {
    return clearVideoProgress(progress, videoId);
  }
  if (total !== null && seconds >= total - VIDEO_RESUME_END_PAD_SECONDS) {
    return clearVideoProgress(progress, videoId);
  }

  return prune({
    ...progress,
    [videoId]: { seconds, duration: total, updatedAt: new Date(now).toISOString() },
  });
}

export function clearVideoProgress(progress: VideoProgress, videoId: string): VideoProgress {
  if (!(videoId in progress)) return progress;
  const out = { ...progress };
  delete out[videoId];
  return out;
}

/** The mark for one video, or null when there's nothing worth resuming from. */
export function videoMarkFor(
  progress: VideoProgress,
  videoId: string | null | undefined,
): VideoMark | null {
  if (!videoId) return null;
  return progress[videoId] ?? null;
}

/** Seconds to start playback at — 0 when the video should start from the top. */
export function videoResumeAt(
  progress: VideoProgress,
  videoId: string | null | undefined,
): number {
  const mark = videoMarkFor(progress, videoId);
  if (!mark || mark.seconds < VIDEO_RESUME_MIN_SECONDS) return 0;
  if (mark.duration !== null && mark.seconds >= mark.duration - VIDEO_RESUME_END_PAD_SECONDS) return 0;
  return Math.floor(mark.seconds);
}

/** How far through, 0–1, for the watched bar under a thumbnail. Null if unknown. */
export function videoWatchedFraction(
  progress: VideoProgress,
  videoId: string | null | undefined,
): number | null {
  const mark = videoMarkFor(progress, videoId);
  if (!mark || mark.duration === null || mark.duration <= 0) return null;
  return Math.min(1, Math.max(0, mark.seconds / mark.duration));
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

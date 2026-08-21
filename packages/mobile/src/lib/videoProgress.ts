import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  VIDEO_PROGRESS_KEY,
  clearVideoProgress,
  markVideoProgress,
  parseVideoProgress,
  serializeVideoProgress,
  videoResumeAt,
  videoWatchedFraction,
  type VideoProgress,
} from '@recipe-aggregator/shared/videoProgress';

/*
 * The AsyncStorage end of the video marks — the mobile twin of the web app's
 * localStorage adapter. The rules all live in shared, so the phone and the
 * laptop agree on what counts as "worth resuming from"; only the storage call
 * differs.
 */

/** What the thumbnail needs to know: where you got to, and how far through. */
export interface VideoMarkView {
  seconds: number;
  fraction: number | null;
}

export const NO_MARK: VideoMarkView = { seconds: 0, fraction: null };

async function read(): Promise<VideoProgress> {
  try {
    return parseVideoProgress(await AsyncStorage.getItem(VIDEO_PROGRESS_KEY));
  } catch {
    return {};
  }
}

async function write(progress: VideoProgress) {
  try {
    await AsyncStorage.setItem(VIDEO_PROGRESS_KEY, serializeVideoProgress(progress));
  } catch {
    // Storage full or unavailable — the video just won't resume next time.
  }
}

export async function loadVideoMark(videoId: string): Promise<VideoMarkView> {
  const progress = await read();
  return {
    seconds: videoResumeAt(progress, videoId),
    fraction: videoWatchedFraction(progress, videoId),
  };
}

export async function saveVideoMark(videoId: string, seconds: number, duration?: number | null) {
  await write(markVideoProgress(await read(), videoId, seconds, duration));
}

export async function forgetVideoMark(videoId: string) {
  await write(clearVideoProgress(await read(), videoId));
}

/*
 * The YouTube IFrame Player API, loaded once and only when a video is actually
 * opened.
 *
 * A plain embed can be *told* where to start (`start=`), but it can't be *asked*
 * where it got to — and asking is the whole point here, since the player is
 * destroyed on close and has to hand its position over before it goes. That
 * needs the real API, so this loads the script on first play and caches the
 * promise. If it never arrives (offline, a blocker), callers fall back to a
 * plain iframe: still resumes from the last known mark, just can't record a
 * new one.
 */

/* The API's surface is far bigger than the five calls we make, and it isn't
   typed for us. Keeping the shape we rely on here documents the contract. */
export interface YouTubePlayer {
  getCurrentTime(): number;
  getDuration(): number;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  destroy(): void;
  getIframe(): HTMLIFrameElement;
}

export interface YouTubeApi {
  Player: new (
    element: HTMLElement | string,
    options: {
      width?: string | number;
      height?: string | number;
      videoId?: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (event: { target: YouTubePlayer }) => void;
        onStateChange?: (event: { data: number; target: YouTubePlayer }) => void;
        onError?: (event: { data: number }) => void;
      };
    },
  ) => YouTubePlayer;
  PlayerState: { ENDED: number; PLAYING: number; PAUSED: number; BUFFERING: number; CUED: number };
}

declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const API_SRC = 'https://www.youtube.com/iframe_api';
const API_TIMEOUT_MS = 8000;

let pending: Promise<YouTubeApi> | null = null;

export function loadYouTubeApi(): Promise<YouTubeApi> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (pending) return pending;

  pending = new Promise<YouTubeApi>((resolve, reject) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error('YouTube API timed out'));
      }
    }, API_TIMEOUT_MS);

    // The API calls this global when it's ready. Chain rather than clobber:
    // it's a documented hook and something else may already own it.
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error('YouTube API loaded without a player'));
    };

    if (!document.querySelector(`script[src="${API_SRC}"]`)) {
      const script = document.createElement('script');
      script.src = API_SRC;
      script.async = true;
      script.onerror = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        reject(new Error('YouTube API failed to load'));
      };
      document.head.appendChild(script);
    }
  }).catch((err) => {
    // Let a later open try again — the kitchen wifi may have come back.
    pending = null;
    throw err;
  });

  return pending;
}

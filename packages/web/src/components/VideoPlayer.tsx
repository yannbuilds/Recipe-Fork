import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { formatVideoTime } from '@recipe-aggregator/shared';
import type { VideoMark } from '@recipe-aggregator/shared';
import {
  beginVideoProgress,
  finishVideoProgress,
  forgetVideoMark,
  resumeAtFor,
  saveVideoMark,
  watchedFractionFor,
} from '../lib/videoProgress';
import { loadYouTubeApi, needsDirectYouTubeTap, type YouTubePlayer } from '../lib/youtube';
import ModalPortal from './ModalPortal';

interface VideoPlayerProps {
  recipeId: string;
  videoId: string;
  title: string;
  /** Cooking recipes keep their mark while their screen is swapped out. */
  retainOnUnmount: boolean;
  /** Cloud-backed mark while this recipe is part of the cooking session. */
  syncedMark?: VideoMark | null;
  onSaveSyncedMark?: (recipeId: string, seconds: number, duration: number | null) => void;
  onClearSyncedMark?: (recipeId: string) => void;
}

/** How often to read the player's clock, and how often to commit it to session memory. */
const POLL_MS = 1000;
const PERSIST_EVERY = 5;

/** How long the "picked up at…" line stays before it gets out of the way. */
const RESUME_NOTE_MS = 5000;

export default function VideoPlayer({
  recipeId,
  videoId,
  title,
  retainOnUnmount,
  syncedMark,
  onSaveSyncedMark,
  onClearSyncedMark,
}: VideoPlayerProps) {
  const [directTap] = useState(needsDirectYouTubeTap);
  const [isOpen, setIsOpen] = useState(false);
  const [apiUnavailable, setApiUnavailable] = useState(false);
  const isOpenRef = useRef(false);
  isOpenRef.current = isOpen;
  /** Where this open started, so the overlay can say so and offer a way back. */
  const [resumedFrom, setResumedFrom] = useState(0);
  const [noteVisible, setNoteVisible] = useState(false);
  /** The mark as it stands, for the thumbnail's watched bar and resume pill. */
  const [mark, setMark] = useState<{ seconds: number; fraction: number | null }>({
    seconds: 0,
    fraction: null,
  });

  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const positionRef = useRef(0);
  const durationRef = useRef<number | null>(null);
  const openAtRef = useRef(0);
  const retentionByRecipeRef = useRef(new Map<string, boolean>());
  retentionByRecipeRef.current.set(recipeId, retainOnUnmount);

  const markView = useCallback(() => {
    if (retainOnUnmount && syncedMark) {
      return {
        seconds: Math.floor(syncedMark.seconds),
        fraction:
          syncedMark.duration && syncedMark.duration > 0
            ? Math.min(1, syncedMark.seconds / syncedMark.duration)
            : null,
      };
    }
    return { seconds: resumeAtFor(recipeId), fraction: watchedFractionFor(recipeId) };
  }, [recipeId, retainOnUnmount, syncedMark]);
  const markViewRef = useRef(markView);
  markViewRef.current = markView;

  /* Refresh the thumbnail from session memory: on mount, and every time the overlay
     closes (the effect below has just written the new position by then). */
  useEffect(() => {
    if (isOpen) return;
    const view = markView();
    setMark(view);
    if (directTap && view.seconds !== openAtRef.current) {
      openAtRef.current = view.seconds;
      positionRef.current = view.seconds;
      try {
        playerRef.current?.cueVideoById({ videoId, startSeconds: view.seconds });
      } catch {
        // onReady will apply the latest mark if the API is not ready yet.
      }
    }
  }, [isOpen, markView, directTap, videoId]);

  const readPlayerClock = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    try {
      const seconds = player.getCurrentTime();
      if (Number.isFinite(seconds) && seconds > 0) positionRef.current = seconds;
      const duration = player.getDuration();
      if (Number.isFinite(duration) && duration > 0) durationRef.current = duration;
    } catch {
      // The iframe can be mid-teardown; the last poll's numbers will do.
    }
  }, []);

  const persist = useCallback(() => {
    saveVideoMark(recipeId, positionRef.current, durationRef.current);
    onSaveSyncedMark?.(recipeId, positionRef.current, durationRef.current);
  }, [onSaveSyncedMark, recipeId]);

  function open() {
    beginVideoProgress(recipeId);
    const at = markView().seconds;
    openAtRef.current = at;
    positionRef.current = at;
    setResumedFrom(at);
    setNoteVisible(at > 0);
    // Mount the autoplay iframe within this click, before loading the API can
    // outlive the browser's user activation.
    flushSync(() => setIsOpen(true));
  }

  function close() {
    // Capture while the iframe is still connected. Waiting for the effect
    // cleanup is too late on some browsers: React has already detached it.
    readPlayerClock();
    persist();
    if (directTap) {
      isOpenRef.current = false;
      openAtRef.current = Math.floor(positionRef.current);
      // Keep the same frame alive for the next trusted tap. Cueing restores
      // YouTube's thumbnail/play button without losing the saved position.
      try {
        playerRef.current?.pauseVideo();
        playerRef.current?.cueVideoById({ videoId, startSeconds: openAtRef.current });
      } catch {
        // The player may already have gone away during navigation.
      }
      if (!playerRef.current) {
        // API-blocked embeds still need to stop when their modal is closed.
        const iframe = hostRef.current?.querySelector('iframe');
        if (iframe) iframe.src = iframe.src;
      }
    }
    setIsOpen(false);
  }

  /* A native dialog can promote the inline iPhone player to the top layer
     without reparenting/reloading its iframe (which would stop playback).
     Between plays it is an ordinary inline box, with no fixed video layer. */
  useLayoutEffect(() => {
    if (!directTap) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen) {
      if (dialog.open) dialog.close();
      dialog.showModal();
    } else {
      if (dialog.matches(':modal')) dialog.close();
      // Setting open avoids show()'s autofocus/scroll when returning inline.
      dialog.open = true;
    }
  }, [directTap, isOpen]);

  /* Send it back to the top — for when the mark is from a session you've
     mentally finished with and rejoining halfway is just confusing. */
  function startOver() {
    openAtRef.current = 0;
    positionRef.current = 0;
    forgetVideoMark(recipeId);
    onClearSyncedMark?.(recipeId);
    setResumedFrom(0);
    setNoteVisible(false);
    const player = playerRef.current;
    try {
      player?.seekTo(0, true);
      player?.playVideo();
    } catch {
      // Nothing to seek yet — the mark is cleared either way.
    }
  }

  /* Overlay chrome: focus, Escape, and the body scroll lock. */
  useEffect(() => {
    if (!isOpen) return;
    closeRef.current?.focus();
    document.body.style.overflow = 'hidden';
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handleKey);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !noteVisible) return;
    const timer = window.setTimeout(() => setNoteVisible(false), RESUME_NOTE_MS);
    return () => window.clearTimeout(timer);
  }, [isOpen, noteVisible]);

  /*
   * The player itself.
   *
   * Desktop starts the iframe on click. iOS loads a paused inline player so
   * the first tap reaches YouTube itself and can start playback with sound.
   * The iframe belongs to the player effect, inside a React-owned host, so
   * the API can destroy it without removing a node React owns.
   */
  const playerMounted = directTap || isOpen;
  useLayoutEffect(() => {
    if (!playerMounted) return;
    const host = hostRef.current;
    if (!host) return;
    setApiUnavailable(false);

    let cancelled = false;
    let ticks = 0;
    let poll = 0;
    if (directTap) {
      openAtRef.current = markViewRef.current().seconds;
      positionRef.current = openAtRef.current;
    }
    const initialAt = openAtRef.current;
    const mount = document.createElement('iframe');
    const params = new URLSearchParams({
      autoplay: directTap ? '0' : '1',
      enablejsapi: '1',
      rel: '0',
      playsinline: '1',
      modestbranding: '1',
      start: String(Math.floor(openAtRef.current)),
      origin: window.location.origin,
    });
    mount.src = `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?${params}`;
    mount.title = `${title} video`;
    mount.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
    mount.allowFullscreen = true;
    mount.className = 'w-full h-full border-0';
    host.appendChild(mount);

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled) return;
        function stateChanged(e: { data: number; target: YouTubePlayer }) {
          if (cancelled) return;
          if (directTap && !isOpenRef.current) {
            if (e.data !== YT.PlayerState.PLAYING) return;
            beginVideoProgress(recipeId);
            setResumedFrom(openAtRef.current);
            setNoteVisible(openAtRef.current > 0);
            isOpenRef.current = true;
            setIsOpen(true);
          }
          readPlayerClock();
          if (e.data === YT.PlayerState.ENDED) {
            positionRef.current = 0;
            openAtRef.current = 0;
            finishVideoProgress(recipeId);
            onClearSyncedMark?.(recipeId);
          } else {
            persist();
          }
        }
        playerRef.current = new YT.Player(mount, {
          events: {
            onReady: (e) => {
              if (cancelled) return;
              playerRef.current = e.target;
              readPlayerClock();
              // `start` gets you close; the seek is what actually lands on the
              // second we left off, and it survives the player re-cueing.
              if (!directTap && openAtRef.current > 0) {
                try {
                  e.target.seekTo(openAtRef.current, true);
                } catch {
                  // Fall back to wherever `start` put us.
                }
              }
              try {
                if (directTap) {
                  // A fast tap can start the video before the API is ready.
                  const state = e.target.getPlayerState();
                  // Never re-cue a tap that is already buffering: that would
                  // cancel the first play while the API is still loading.
                  if (state === -1 || state === YT.PlayerState.CUED) {
                    const at = markViewRef.current().seconds;
                    openAtRef.current = at;
                    positionRef.current = at;
                    if (at !== initialAt) e.target.cueVideoById({ videoId, startSeconds: at });
                  }
                  stateChanged({ data: state, target: e.target });
                } else {
                  e.target.playVideo();
                }
              } catch {
                // Autoplay refused — the mark is still good, you just press play.
              }
              poll = window.setInterval(() => {
                if (directTap && !isOpenRef.current) return;
                readPlayerClock();
                ticks += 1;
                // Commit every few seconds so an unexpected screen change
                // loses seconds, not the whole position.
                if (ticks % PERSIST_EVERY === 0) persist();
              }, POLL_MS);
            },
            onStateChange: stateChanged,
          },
        });
      })
      .catch(() => {
        // The original embed keeps playing even without the API; it still
        // starts at the saved mark, but cannot record a new one this time.
        if (!cancelled) setApiUnavailable(true);
      });

    return () => {
      cancelled = true;
      window.clearInterval(poll);
      // One last read before the iframe goes, so closing mid-sentence resumes
      // mid-sentence rather than at the last poll.
      readPlayerClock();
      try {
        playerRef.current?.destroy();
      } catch {
        // Already gone.
      }
      playerRef.current = null;
      persist();
      host.replaceChildren();
    };
  }, [playerMounted, directTap, videoId, title, recipeId, readPlayerClock, persist]);

  /* Browsing a recipe owns a page-scoped mark. A cooking recipe is different:
     its component unmounts every time the cook bar swaps to another pot, so
     keep that mark until endCook/clearSession explicitly removes it. Declared
     after the player effect so this clear is the final unmount operation. */
  useEffect(() => () => {
    readPlayerClock();
    persist();
    if (!retentionByRecipeRef.current.get(recipeId)) forgetVideoMark(recipeId);
  }, [recipeId, readPlayerClock, persist]);

  /* iOS kills backgrounded tabs without running React cleanups, so commit on
     the way out too. */
  useEffect(() => {
    if (!isOpen) return;
    function save() {
      readPlayerClock();
      persist();
    }
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', save);
    return () => {
      window.removeEventListener('pagehide', save);
      document.removeEventListener('visibilitychange', save);
    };
  }, [isOpen, readPlayerClock, persist]);

  const hasMark = mark.seconds > 0;

  const playerContent = (
    <>
      {isOpen && (
        <button
          ref={closeRef}
          className="absolute top-4 right-4 z-10 text-white/80 hover:text-white transition-colors"
          onClick={close}
          aria-label="Close video"
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}

      {/* Say out loud that it picked up where you left off — otherwise a
          video starting three minutes in just looks broken. */}
      {isOpen && resumedFrom > 0 && noteVisible && (
        <div
          className="absolute z-10 flex items-center gap-3"
          style={{
            top: 20,
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '7px 14px',
            borderRadius: 999,
            background: 'rgba(251,248,241,0.94)',
            color: '#1f1b16',
            fontFamily: '"DM Sans", system-ui, sans-serif',
            fontSize: 13,
            whiteSpace: directTap ? 'nowrap' : undefined,
            boxShadow: '0 6px 20px rgba(0,0,0,0.25)',
            animation: 'fadeIn 0.2s ease',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <span>Picking up at {formatVideoTime(resumedFrom)}</span>
          <button
            onClick={startOver}
            style={{
              font: 'inherit',
              fontWeight: 600,
              color: 'var(--green-solid)',
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
            }}
          >
            Start over
          </button>
        </div>
      )}

      <div
        className={directTap && !isOpen ? 'w-full h-full' : 'w-full max-w-5xl mx-4'}
        style={directTap && !isOpen ? undefined : { aspectRatio: '16/9', maxHeight: '80vh', minHeight: directTap ? 200 : undefined }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          ref={hostRef}
          className="w-full h-full rounded-lg overflow-hidden"
          style={{ background: '#000' }}
        />
      </div>
    </>
  );

  return (
    <>
      {/* Thumbnail with play button — editorial style (cream circle + green triangle) */}
      {!directTap && (
        <button
          className="relative w-full overflow-hidden block group"
          style={{ paddingBottom: '56.25%', borderRadius: 4, border: '1px solid var(--border)' }}
          onClick={open}
          aria-label={hasMark ? `Resume ${title} video at ${formatVideoTime(mark.seconds)}` : `Play ${title} video`}
        >
          <img
            className="absolute inset-0 w-full h-full object-cover"
            src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`}
            alt={`${title} video thumbnail`}
            loading="lazy"
          />
          {/* Soft scrim */}
          <div className="absolute inset-0" style={{ background: 'rgba(31,27,22,0.18)' }} />
          {/* Play button */}
          <div className="absolute inset-0 flex items-center justify-center">
            <span
              className="flex items-center justify-center rounded-full transition-transform group-hover:scale-105"
              style={{
                width: 56,
                height: 56,
                background: 'rgba(251,248,241,0.94)',
                border: '1px solid rgba(0,0,0,0.06)',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="var(--green)" stroke="none">
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
          </div>

          {/* Where you left it — the pill says it, the bar shows it. */}
          {hasMark && (
            <span
              style={{
                position: 'absolute',
                left: 10,
                bottom: 12,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '3px 9px',
                borderRadius: 999,
                background: 'rgba(251,248,241,0.94)',
                // The pill is cream in both themes, so it needs the green that
                // stays dark in dark mode rather than the themed one.
                color: 'var(--green-solid)',
                fontFamily: '"JetBrains Mono", ui-monospace, Menlo, monospace',
                fontSize: 10,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              Resume {formatVideoTime(mark.seconds)}
            </span>
          )}
          {mark.fraction !== null && (
            <span
              aria-hidden
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                height: 3,
                background: 'rgba(31,27,22,0.35)',
              }}
            >
              <span
                style={{
                  display: 'block',
                  height: '100%',
                  width: `${Math.round(mark.fraction * 100)}%`,
                  background: 'var(--green)',
                }}
              />
            </span>
          )}
        </button>
      )}

      {/* iOS keeps its player inline until a trusted YouTube tap starts it.
          The native dialog supplies the modal top layer only while watching;
          keeping a fixed video layer while browsing breaks iOS scrolling. */}
      {directTap && (
        <>
          <div style={{ position: 'relative', aspectRatio: '16/9', minHeight: 200 }}>
            <dialog
              ref={dialogRef}
              open
              className="rf-direct-video flex items-center justify-center"
              aria-label={`${title} video`}
              aria-modal={isOpen || undefined}
              onCancel={(e) => { e.preventDefault(); close(); }}
              onClick={(e) => { if (isOpen && e.target === e.currentTarget) close(); }}
              style={isOpen ? {
                position: 'fixed', inset: 0, width: '100%', height: '100%',
                maxWidth: 'none', maxHeight: 'none', margin: 0, padding: 0,
                border: 0, background: 'rgba(0,0,0,0.9)', color: '#fff',
              } : {
                position: 'absolute', inset: 0, width: '100%', height: '100%',
                maxWidth: 'none', maxHeight: 'none', margin: 0, padding: 0,
                border: '1px solid var(--border)', borderRadius: 4, background: '#000',
              }}
            >
              {playerContent}
            </dialog>
          </div>
          {!isOpen && apiUnavailable && (
            <button onClick={open} className="mt-2 text-sm underline" style={{ color: 'var(--green)' }}>
              Expand video
            </button>
          )}
          {!isOpen && hasMark && (
            <div className="flex items-center gap-2 mt-2" style={{ color: 'var(--green)', fontSize: 12 }}>
              <span>Resume {formatVideoTime(mark.seconds)}</span>
              {mark.fraction !== null && (
                <span className="flex-1 h-[3px]" style={{ background: 'var(--border)' }} aria-hidden>
                  <span className="block h-full" style={{ width: `${Math.round(mark.fraction * 100)}%`, background: 'var(--green)' }} />
                </span>
              )}
            </div>
          )}
        </>
      )}
      {!directTap && isOpen && (
        <ModalPortal>
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          style={{ animation: 'fadeIn 0.2s ease' }}
          role="dialog"
          aria-modal="true"
          onClick={close}
        >
          {playerContent}
        </div>
        </ModalPortal>
      )}
    </>
  );
}

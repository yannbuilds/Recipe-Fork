import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatVideoTime } from '@recipe-aggregator/shared';
import { forgetVideoMark, resumeAtFor, saveVideoMark, watchedFractionFor } from '../lib/videoProgress';
import { loadYouTubeApi, type YouTubePlayer } from '../lib/youtube';

interface VideoPlayerProps {
  videoId: string;
  title: string;
}

/** How often to read the player's clock, and how often to commit it to storage. */
const POLL_MS = 1000;
const PERSIST_EVERY = 5;

/** How long the "picked up at…" line stays before it gets out of the way. */
const RESUME_NOTE_MS = 5000;

export default function VideoPlayer({ videoId, title }: VideoPlayerProps) {
  const [isOpen, setIsOpen] = useState(false);
  /** Where this open started, so the overlay can say so and offer a way back. */
  const [resumedFrom, setResumedFrom] = useState(0);
  const [noteVisible, setNoteVisible] = useState(false);
  /** The API didn't turn up — fall back to a plain embed for this open. */
  const [apiFailed, setApiFailed] = useState(false);
  /** The mark as it stands, for the thumbnail's watched bar and resume pill. */
  const [mark, setMark] = useState<{ seconds: number; fraction: number | null }>({
    seconds: 0,
    fraction: null,
  });

  const closeRef = useRef<HTMLButtonElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const positionRef = useRef(0);
  const durationRef = useRef<number | null>(null);
  const openAtRef = useRef(0);

  /* Refresh the thumbnail from storage: on mount, and every time the overlay
     closes (the effect below has just written the new position by then). */
  useEffect(() => {
    if (isOpen) return;
    setMark({ seconds: resumeAtFor(videoId), fraction: watchedFractionFor(videoId) });
  }, [isOpen, videoId]);

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
    saveVideoMark(videoId, positionRef.current, durationRef.current);
  }, [videoId]);

  function open() {
    const at = resumeAtFor(videoId);
    openAtRef.current = at;
    positionRef.current = at;
    setResumedFrom(at);
    setNoteVisible(at > 0);
    setApiFailed(false);
    setIsOpen(true);
  }

  function close() {
    setIsOpen(false);
  }

  /* Send it back to the top — for when the mark is from a session you've
     mentally finished with and rejoining halfway is just confusing. */
  function startOver() {
    openAtRef.current = 0;
    positionRef.current = 0;
    forgetVideoMark(videoId);
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
   * Built through the IFrame API rather than dropped in as an `<iframe>` so it
   * can be asked where it got to before it's destroyed — that answer is the
   * whole resume feature. It's created into a plain DOM node appended to the
   * React-owned host: the API swaps that node for its iframe, and React must
   * never be holding a reference to something it didn't put there.
   */
  useEffect(() => {
    if (!isOpen) return;
    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;
    let ticks = 0;
    let poll = 0;
    const mount = document.createElement('div');
    host.appendChild(mount);

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled) return;
        playerRef.current = new YT.Player(mount, {
          width: '100%',
          height: '100%',
          videoId,
          playerVars: {
            autoplay: 1,
            rel: 0,
            playsinline: 1,
            modestbranding: 1,
            start: Math.floor(openAtRef.current),
            origin: window.location.origin,
          },
          events: {
            onReady: (e) => {
              if (cancelled) return;
              playerRef.current = e.target;
              readPlayerClock();
              // `start` gets you close; the seek is what actually lands on the
              // second we left off, and it survives the player re-cueing.
              if (openAtRef.current > 0) {
                try {
                  e.target.seekTo(openAtRef.current, true);
                } catch {
                  // Fall back to wherever `start` put us.
                }
              }
              try {
                e.target.playVideo();
              } catch {
                // Autoplay refused — the mark is still good, you just press play.
              }
              poll = window.setInterval(() => {
                readPlayerClock();
                ticks += 1;
                // Commit every few seconds so a killed tab loses seconds, not
                // the whole session.
                if (ticks % PERSIST_EVERY === 0) persist();
              }, POLL_MS);
            },
            onStateChange: (e) => {
              readPlayerClock();
              if (e.data === YT.PlayerState.ENDED) {
                // Watched to the end: next open starts from the top.
                positionRef.current = 0;
                forgetVideoMark(videoId);
              } else {
                persist();
              }
            },
          },
        });
      })
      .catch(() => {
        if (!cancelled) setApiFailed(true);
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
  }, [isOpen, videoId, readPlayerClock, persist]);

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

  return (
    <>
      {/* Thumbnail with play button — editorial style (cream circle + green triangle) */}
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

      {/* Fullscreen overlay — portaled to body, and mounted only while open.
          It used to stay mounted permanently "so the iframe stays alive", which
          left a full-viewport position:fixed layer wrapping a live YouTube
          player on every recipe page with a video. iOS drops the whole page off
          compositor scrolling when it has to deal with that, and every
          position:fixed element — the bottom nav included — then scrolls with
          the content instead of staying pinned. The mark in storage is what
          replaces that always-alive iframe: the position outlives the player. */}
      {isOpen && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          style={{ animation: 'fadeIn 0.2s ease' }}
          role="dialog"
          aria-modal="true"
          onClick={close}
        >
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

          {/* Say out loud that it picked up where you left off — otherwise a
              video starting three minutes in just looks broken. */}
          {resumedFrom > 0 && noteVisible && (
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
            className="w-full max-w-5xl mx-4"
            style={{ aspectRatio: '16/9', maxHeight: '80vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            {apiFailed ? (
              /* No API — still resumes from the mark, it just can't record a
                 new one this time round. */
              <iframe
                className="w-full h-full rounded-lg"
                src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&playsinline=1&start=${Math.floor(openAtRef.current)}`}
                title={`${title} video`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <div
                ref={hostRef}
                className="w-full h-full rounded-lg overflow-hidden"
                style={{ background: '#000' }}
              />
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

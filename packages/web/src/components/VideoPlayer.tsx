import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface VideoPlayerProps {
  videoId: string;
  title: string;
}

export default function VideoPlayer({ videoId, title }: VideoPlayerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  function open() {
    setIsOpen(true);
  }

  // Unmounting the overlay stops playback, so there's no pause command to send.
  function close() {
    setIsOpen(false);
  }

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

  return (
    <>
      {/* Thumbnail with play button — editorial style (cream circle + green triangle) */}
      <button
        className="relative w-full overflow-hidden block group"
        style={{ paddingBottom: '56.25%', borderRadius: 4, border: '1px solid var(--border)' }}
        onClick={open}
        aria-label={`Play ${title} video`}
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
      </button>

      {/* Fullscreen overlay — portaled to body, and mounted only while open.
          It used to stay mounted permanently "so the iframe stays alive", which
          left a full-viewport position:fixed layer wrapping a live YouTube
          player on every recipe page with a video. iOS drops the whole page off
          compositor scrolling when it has to deal with that, and every
          position:fixed element — the bottom nav included — then scrolls with
          the content instead of staying pinned. Autoplay via the src param
          replaces the postMessage play command the live iframe was needed for. */}
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
          <div
            className="w-full max-w-5xl mx-4"
            style={{ aspectRatio: '16/9', maxHeight: '80vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            <iframe
              className="w-full h-full rounded-lg"
              src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`}
              title={`${title} video`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

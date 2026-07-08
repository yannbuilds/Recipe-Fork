import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface VideoPlayerProps {
  videoId: string;
  title: string;
}

export default function VideoPlayer({ videoId, title }: VideoPlayerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  function sendCommand(func: string) {
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: 'command', func, args: '' }), '*'
    );
  }

  function open() {
    setIsOpen(true);
    // Small delay to ensure overlay is visible before sending play command
    setTimeout(() => sendCommand('playVideo'), 100);
  }

  function close() {
    sendCommand('pauseVideo');
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

      {/* Fullscreen overlay — portaled to body, always mounted so iframe stays alive */}
      {createPortal(
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center bg-black/90 transition-opacity ${isOpen ? 'opacity-100' : 'opacity-0 invisible pointer-events-none'}`}
          role="dialog"
          aria-modal={isOpen}
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
              ref={iframeRef}
              className="w-full h-full rounded-lg"
              src={`https://www.youtube.com/embed/${videoId}?enablejsapi=1`}
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

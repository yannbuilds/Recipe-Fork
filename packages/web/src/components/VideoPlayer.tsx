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
      {/* Thumbnail with play button */}
      <button
        className="relative w-full overflow-hidden rounded-lg block group"
        style={{ paddingBottom: '56.25%' }}
        onClick={open}
        aria-label={`Play ${title} video`}
      >
        <img
          className="absolute inset-0 w-full h-full object-cover"
          src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`}
          alt={`${title} video thumbnail`}
          loading="lazy"
        />
        {/* Play icon */}
        <div className="absolute inset-0 flex items-center justify-center">
          <svg
            viewBox="0 0 68 48"
            className="w-16 h-12 opacity-80 group-hover:opacity-100 transition-opacity"
          >
            <path
              d="M66.52,7.74c-0.78-2.93-2.49-5.41-5.42-6.19C55.79,0,34,0,34,0S12.21,0,6.9,1.55C3.97,2.33,2.27,4.81,1.48,7.74C0,13.05,0,24,0,24s0,10.95,1.48,16.26c0.78,2.93,2.49,5.41,5.42,6.19C12.21,48,34,48,34,48s21.79,0,27.1-1.55c2.93-0.78,4.64-3.26,5.42-6.19C68,34.95,68,24,68,24S68,13.05,66.52,7.74z"
              fill="#FF0000"
            />
            <path d="M 45,24 27,14 27,34" fill="#fff" />
          </svg>
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

import { useState, useEffect, useRef } from 'react';
import { registerSW } from 'virtual:pwa-register';

let updateSWFn: ((reloadPage?: boolean) => Promise<void>) | undefined;

export default function PWAUpdateBanner() {
  const [showUpdate, setShowUpdate] = useState(false);
  const lastCheckRef = useRef(0);

  useEffect(() => {
    updateSWFn = registerSW({
      onNeedRefresh() {
        setShowUpdate(true);
      },
      onOfflineReady() {
        console.log('Pie Keeper is ready to work offline.');
      },
    });

    // Check for SW updates when the app regains focus (fixes iOS PWA)
    function onVisibilityChange() {
      if (document.visibilityState !== 'visible') return;

      const now = Date.now();
      if (now - lastCheckRef.current < 60_000) return; // throttle: once per minute
      lastCheckRef.current = now;

      navigator.serviceWorker?.ready.then((reg) => reg.update());
    }

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  if (!showUpdate) return null;

  return (
    <div
      className="fixed left-0 right-0 z-[60] flex items-center justify-between gap-3 px-4 py-3"
      style={{
        bottom: 72,
        background: 'var(--green)',
        color: 'white',
        boxShadow: 'var(--shadow-md)',
      }}
    >
      <span className="text-sm font-medium">A new version is available</span>
      <div className="flex gap-2">
        <button
          onClick={() => setShowUpdate(false)}
          className="text-sm px-3 py-1 rounded-lg"
          style={{ background: 'rgba(255,255,255,0.15)' }}
        >
          Later
        </button>
        <button
          onClick={() => updateSWFn?.(true)}
          className="text-sm font-semibold px-3 py-1 rounded-lg"
          style={{ background: 'white', color: 'var(--green)' }}
        >
          Reload
        </button>
      </div>
    </div>
  );
}

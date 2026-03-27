import { useState, useEffect } from 'react';
import { registerSW } from 'virtual:pwa-register';

let updateSWFn: ((reloadPage?: boolean) => Promise<void>) | undefined;

export default function PWAUpdateBanner() {
  const [showUpdate, setShowUpdate] = useState(false);

  useEffect(() => {
    updateSWFn = registerSW({
      onNeedRefresh() {
        setShowUpdate(true);
      },
      onOfflineReady() {
        console.log('Pie Keeper is ready to work offline.');
      },
    });
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
          style={{ background: 'rgba(255,255,255,0.2)' }}
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

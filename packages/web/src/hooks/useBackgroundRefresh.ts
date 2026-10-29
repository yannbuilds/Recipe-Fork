import { useEffect, useState } from 'react';

export default function useBackgroundRefresh() {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const refresh = () => { if (navigator.onLine) setRevision(value => value + 1); };
    const visible = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', visible);
    };
  }, []);
  return revision;
}

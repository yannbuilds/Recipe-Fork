import { useState, type Dispatch, type SetStateAction } from 'react';
import { useAuth } from '../context/AuthContext';

import { OFFLINE_PREFIX, readOfflineData } from '../lib/offlineStorage';
export { readOfflineData } from '../lib/offlineStorage';

/** Restore before paint; writes are made only by explicit state updates. */
export default function useOfflineState<T>(key: string, fallback: T): [T, Dispatch<SetStateAction<T>>] {
  const { user } = useAuth();
  const storageKey = `${OFFLINE_PREFIX}${user?.id ?? 'signed-out'}:${key}`;
  const restore = () => readOfflineData<T>(user?.id, key) ?? fallback;
  const [state, setState] = useState(() => ({ key: storageKey, value: restore() }));
  if (state.key !== storageKey) setState({ key: storageKey, value: restore() });
  const value = state.key === storageKey ? state.value : restore();
  const setValue: Dispatch<SetStateAction<T>> = (update) => {
    setState(previous => {
      // Ignore a response belonging to a screen/account that has since changed.
      if (previous.key !== storageKey) return previous;
      const next = typeof update === 'function'
        ? (update as (previous: T) => T)(previous.value) : update;
      if (user) {
        try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Quota full: keep in memory. */ }
      }
      return { key: storageKey, value: next };
    });
  };
  return [value, setValue];
}

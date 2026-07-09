import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

// "Keep screen on while cooking" is a single persisted preference, not per-screen
// state. It defaults OFF so recipes don't force the screen on, and it survives
// navigation and app restarts — turn it off once and it stays off. A tiny
// subscribable store keeps every mounted recipe screen in sync.
const KEY = 'keep-screen-awake';

let current = false;
let loaded = false;
const listeners = new Set<(v: boolean) => void>();

function emit() {
  for (const l of listeners) l(current);
}

async function loadOnce() {
  if (loaded) return;
  loaded = true;
  try {
    current = (await AsyncStorage.getItem(KEY)) === '1';
    emit();
  } catch {
    // keep the default (off) if storage is unavailable
  }
}

export function setKeepAwakePref(next: boolean) {
  if (current === next) return;
  current = next;
  emit();
  AsyncStorage.setItem(KEY, next ? '1' : '0').catch(() => {});
}

export function useKeepAwakePref(): [boolean, (next: boolean) => void] {
  const [value, setValue] = useState(current);
  useEffect(() => {
    listeners.add(setValue);
    loadOnce();
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  return [value, setKeepAwakePref];
}

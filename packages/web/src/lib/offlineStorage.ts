export const OFFLINE_PREFIX = 'piekeeper-offline-v1:';
export function clearOfflineData() {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(OFFLINE_PREFIX)) localStorage.removeItem(key);
    }
  } catch { /* Storage can be unavailable in private browsing. */ }
}

export function readOfflineData<T>(userId: string | undefined, key: string): T | undefined {
  if (!userId) return undefined;
  try {
    const raw = localStorage.getItem(`${OFFLINE_PREFIX}${userId}:${key}`);
    return raw === null ? undefined : JSON.parse(raw) as T;
  } catch { return undefined; }
}


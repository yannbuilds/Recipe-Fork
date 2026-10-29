interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
  removeItem(key: string): Promise<unknown>;
}

/** Reject legacy/unowned snapshots before any private queries can hydrate. */
export function accountScopedStorage(storage: AsyncStorageLike, accountId: () => Promise<string | null>) {
  return {
    async getItem(key: string): Promise<string | null> {
      try {
        const owner = await accountId();
        if (!owner) return null;
        const raw = await storage.getItem(key);
        if (!raw) return null;
        const snapshot = JSON.parse(raw);
        if (snapshot.owner !== owner || typeof snapshot.value !== 'string') return null;
        if (await accountId() !== owner) return null;
        return snapshot.value;
      } catch { return null; }
    },
    async setItem(key: string, value: string) {
      const owner = await accountId();
      if (owner) await storage.setItem(key, JSON.stringify({ owner, value }));
    },
    async removeItem(key: string) { await storage.removeItem(key); },
  };
}

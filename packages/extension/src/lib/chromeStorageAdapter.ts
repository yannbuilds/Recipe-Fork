import type { SupportedStorage } from '@supabase/supabase-js';

/**
 * Supabase storage adapter backed by chrome.storage.local.
 * Unlike localStorage, this persists across popup open/close cycles
 * and is accessible from both the popup and service worker contexts.
 */
export const chromeStorageAdapter: SupportedStorage = {
  async getItem(key: string): Promise<string | null> {
    const result = await chrome.storage.local.get(key);
    return result[key] ?? null;
  },
  async setItem(key: string, value: string): Promise<void> {
    await chrome.storage.local.set({ [key]: value });
  },
  async removeItem(key: string): Promise<void> {
    await chrome.storage.local.remove(key);
  },
};

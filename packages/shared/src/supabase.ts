import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. ' +
    'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.'
  );
}

const isProduction = typeof window !== 'undefined' &&
  (window.location.hostname === 'piekeeper.com' ||
   window.location.hostname === 'www.piekeeper.com' ||
   window.location.hostname === 'app.piekeeper.com');

const cookieDomain = isProduction ? '.piekeeper.com' : undefined;

// Browser cookies have a ~4096 byte value limit. Supabase Google OAuth sessions
// easily exceed this (avatar URLs, provider metadata, etc.), causing the browser
// to silently drop the cookie and Supabase to fire SIGNED_OUT immediately after
// SIGNED_IN. We chunk large values across multiple cookies to avoid this.
const MAX_CHUNK = 3000;

function encodeCookie(key: string, value: string, maxAge: number): string {
  const parts = [
    `${encodeURIComponent(key)}=${value}`,
    'path=/',
    `max-age=${maxAge}`,
    'SameSite=Lax',
  ];
  if (isProduction) parts.push('Secure');
  if (cookieDomain) parts.push(`domain=${cookieDomain}`);
  return parts.join('; ');
}

function getRawCookie(key: string): string | null {
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${encodeURIComponent(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=([^;]*)`)
  );
  return match ? match[1] : null;
}

function clearChunks(key: string): void {
  let i = 0;
  while (getRawCookie(`${key}.${i}`) !== null) {
    document.cookie = encodeCookie(`${key}.${i}`, '', 0);
    i++;
  }
}

const cookieStorage = {
  getItem: (key: string): string | null => {
    // Chunked read: if key.0 exists, reassemble from chunks
    const firstChunk = getRawCookie(`${key}.0`);
    if (firstChunk !== null) {
      let encoded = '';
      let i = 0;
      while (true) {
        const chunk = getRawCookie(`${key}.${i}`);
        if (chunk === null) break;
        encoded += chunk;
        i++;
      }
      try {
        return decodeURIComponent(encoded);
      } catch {
        return null;
      }
    }
    // Single-cookie read
    const raw = getRawCookie(key);
    if (raw === null) return null;
    try {
      return decodeURIComponent(raw);
    } catch {
      return null;
    }
  },
  setItem: (key: string, value: string): void => {
    const encoded = encodeURIComponent(value);
    const ttl = 60 * 60 * 24 * 365;
    if (encoded.length <= MAX_CHUNK) {
      clearChunks(key);
      document.cookie = encodeCookie(key, encoded, ttl);
    } else {
      // Clear the single-cookie slot, write chunks
      document.cookie = encodeCookie(key, '', 0);
      const total = Math.ceil(encoded.length / MAX_CHUNK);
      for (let i = 0; i < total; i++) {
        const chunk = encoded.slice(i * MAX_CHUNK, (i + 1) * MAX_CHUNK);
        document.cookie = encodeCookie(`${key}.${i}`, chunk, ttl);
      }
    }
  },
  removeItem: (key: string): void => {
    document.cookie = encodeCookie(key, '', 0);
    clearChunks(key);
  },
};

if (typeof window !== 'undefined') {
  const LS_KEY = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;

  // One-time migration: copy any existing localStorage session into cookies
  const existing = localStorage.getItem(LS_KEY);
  if (existing && !cookieStorage.getItem(LS_KEY)) {
    cookieStorage.setItem(LS_KEY, existing);
    localStorage.removeItem(LS_KEY);
  }

  // One-time migration: re-chunk any oversized single cookies (e.g. Google OAuth
  // sessions stored before chunking was introduced that were silently truncated).
  const raw = getRawCookie(LS_KEY);
  if (raw && getRawCookie(`${LS_KEY}.0`) === null) {
    try {
      const value = decodeURIComponent(raw);
      // If we can parse it as JSON it's intact — re-write through setItem so it
      // gets chunked if needed. If it can't be parsed it was truncated; clear it
      // so the user gets a clean sign-in prompt rather than a broken session.
      JSON.parse(value);
      cookieStorage.setItem(LS_KEY, value);
    } catch {
      document.cookie = encodeCookie(LS_KEY, '', 0);
    }
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: cookieStorage,
    flowType: 'pkce',
  },
});

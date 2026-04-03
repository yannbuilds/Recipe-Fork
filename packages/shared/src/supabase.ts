import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. ' +
    'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.'
  );
}

// Use cookies instead of localStorage so the auth session is shared
// across piekeeper.com and app.piekeeper.com (same parent domain).
const isProduction = typeof window !== 'undefined' &&
  (window.location.hostname === 'piekeeper.com' ||
   window.location.hostname === 'www.piekeeper.com' ||
   window.location.hostname === 'app.piekeeper.com');

const cookieDomain = isProduction ? '.piekeeper.com' : undefined;

function encodeCookie(key: string, value: string, maxAge: number): string {
  const parts = [
    `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
    'path=/',
    `max-age=${maxAge}`,
    'SameSite=Lax',
  ];
  if (isProduction) parts.push('Secure');
  if (cookieDomain) parts.push(`domain=${cookieDomain}`);
  return parts.join('; ');
}

const cookieStorage = {
  getItem: (key: string): string | null => {
    const match = document.cookie.match(
      new RegExp(`(?:^|; )${encodeURIComponent(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=([^;]*)`)
    );
    return match ? decodeURIComponent(match[1]) : null;
  },
  setItem: (key: string, value: string): void => {
    document.cookie = encodeCookie(key, value, 60 * 60 * 24 * 365);
  },
  removeItem: (key: string): void => {
    document.cookie = encodeCookie(key, '', 0);
  },
};

// One-time migration: copy any existing localStorage session into cookies
// so current users don't get logged out after this change.
if (typeof window !== 'undefined') {
  const LS_KEY = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
  const existing = localStorage.getItem(LS_KEY);
  if (existing && !cookieStorage.getItem(LS_KEY)) {
    cookieStorage.setItem(LS_KEY, existing);
    localStorage.removeItem(LS_KEY);
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: cookieStorage,
    flowType: 'pkce',
  },
});

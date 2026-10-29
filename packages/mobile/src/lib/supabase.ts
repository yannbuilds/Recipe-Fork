import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// Mobile has its own client — the shared package's client uses cookie storage
// and import.meta.env, neither of which exist in React Native.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. ' +
      'Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in packages/mobile/.env.',
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export async function readStoredSession() {
  try {
    const key = `sb-${new URL(supabaseUrl!).hostname.split('.')[0]}-auth-token`;
    const session = JSON.parse(await AsyncStorage.getItem(key) ?? 'null');
    return session?.user?.id && session?.access_token && session?.refresh_token
      ? session as import('@supabase/supabase-js').Session : null;
  } catch { return null; }
}

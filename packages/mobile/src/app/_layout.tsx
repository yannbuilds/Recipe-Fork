import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import Constants from 'expo-constants';
import { Stack, usePathname, useRouter } from 'expo-router';
import { ShareIntentProvider, useShareIntentContext } from 'expo-share-intent';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import BootScreen from '@/components/BootScreen';
import CookingBar from '@/components/CookingBar';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { CookSessionProvider } from '@/context/CookSessionContext';
import { OnboardingProvider, useOnboarding } from '@/context/OnboardingContext';
import { useAppFonts } from '@/lib/fonts';
import { font, ThemePreferenceProvider, useIsDark, useTheme } from '@/lib/theme';

// gcTime must be >= the persister's maxAge, otherwise cached queries are
// garbage-collected before they can be restored. One week covers the "open the
// app on the couch or in a dead-zone kitchen" case without hoarding stale data.
const ONE_WEEK = 1000 * 60 * 60 * 24 * 7;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: ONE_WEEK,
      retry: 1,
      // Serve cached data immediately when offline, then refetch when back online.
      networkMode: 'offlineFirst',
    },
  },
});

const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'recipe-fork-query-cache',
});

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  return (
    <ShareIntentProvider
      options={{
        // Native share extensions do not exist inside Expo Go. Keeping the
        // module disabled there preserves the normal preview workflow.
        disabled: Constants.appOwnership === 'expo',
        resetOnBackground: false,
        scheme: 'piekeeper',
      }}
    >
      <ThemePreferenceProvider>
        <OnboardingProvider>
          <RootLayoutInner />
        </OnboardingProvider>
      </ThemePreferenceProvider>
    </ShareIntentProvider>
  );
}

function RootLayoutInner() {
  const isDark = useIsDark();
  const [fontsLoaded, fontError] = useAppFonts();
  const fontsReady = fontsLoaded || !!fontError;

  // Hand off from the native splash to our animated boot screen as soon as the
  // fonts resolve. BootScreen keeps the same green backdrop, so the transition
  // is seamless while auth + cache hydrate underneath.
  useEffect(() => {
    if (fontsReady) SplashScreen.hideAsync().catch(() => {});
  }, [fontsReady]);

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: ONE_WEEK }}
    >
      <AuthProvider>
        <CookSessionProvider>
          <StatusBar style={isDark ? 'light' : 'dark'} />
          {fontsReady ? <Navigator /> : null}
          {/* Above the navigator so a live cook is one tap away from any
              screen, and survives every push and tab switch. Draws nothing
              when the stove is cold. */}
          {fontsReady ? <CookingBar /> : null}
          {fontsReady ? <IncomingShareRouter /> : null}
          <BootGate fontsReady={fontsReady} />
        </CookSessionProvider>
      </AuthProvider>
    </PersistQueryClientProvider>
  );
}

function IncomingShareRouter() {
  const router = useRouter();
  const pathname = usePathname();
  const { loading } = useAuth();
  const { isReady, hasShareIntent } = useShareIntentContext();

  useEffect(() => {
    if (loading || !isReady || !hasShareIntent || pathname === '/share-recipe') return;
    router.push('/share-recipe');
  }, [hasShareIntent, isReady, loading, pathname, router]);

  return null;
}

// Keeps the boot screen up until fonts, auth and the onboarding flag have all
// resolved — so the very first frame the user sees is never a half-loaded UI.
function BootGate({ fontsReady }: { fontsReady: boolean }) {
  const { loading: authLoading } = useAuth();
  const { ready: onboardingReady } = useOnboarding();
  const ready = fontsReady && !authLoading && onboardingReady;
  return <BootScreen ready={ready} />;
}

function Navigator() {
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.bg },
        headerTintColor: theme.text,
        headerShadowVisible: false,
        headerTitleStyle: { fontFamily: font.serifSemi },
        contentStyle: { backgroundColor: theme.bg },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false, animation: 'fade' }} />
      <Stack.Screen
        name="onboarding"
        options={{ headerShown: false, animation: 'fade', gestureEnabled: false }}
      />
      <Stack.Screen name="sign-in" options={{ headerShown: false, animation: 'fade' }} />
      <Stack.Screen name="share-recipe" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="recipe/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="cookbook/[id]" options={{ title: '' }} />
    </Stack>
  );
}

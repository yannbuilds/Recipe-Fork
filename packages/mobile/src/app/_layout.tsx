import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { AuthProvider } from '@/context/AuthContext';
import { useAppFonts } from '@/lib/fonts';
import { font, useTheme } from '@/lib/theme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60_000, retry: 1 },
  },
});

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const theme = useTheme();
  const [fontsLoaded, fontError] = useAppFonts();

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return <View style={{ flex: 1, backgroundColor: theme.bg }} />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <StatusBar style="auto" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: theme.bg },
            headerTintColor: theme.text,
            headerShadowVisible: false,
            headerTitleStyle: { fontFamily: font.serifSemi },
            contentStyle: { backgroundColor: theme.bg },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="sign-in" options={{ headerShown: false }} />
          <Stack.Screen name="recipe/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="cookbook/[id]" options={{ title: '' }} />
          <Stack.Screen name="new-recipe" options={{ presentation: 'modal', headerShown: false }} />
        </Stack>
      </AuthProvider>
    </QueryClientProvider>
  );
}

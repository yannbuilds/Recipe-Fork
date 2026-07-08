import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '@/context/AuthContext';
import { useTheme } from '@/lib/theme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
    },
  },
});

export default function RootLayout() {
  const theme = useTheme();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <StatusBar style="auto" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: theme.background },
            headerTintColor: theme.text,
            headerShadowVisible: false,
            contentStyle: { backgroundColor: theme.background },
          }}
        >
          <Stack.Screen name="index" options={{ title: 'Pie Keeper' }} />
          <Stack.Screen name="sign-in" options={{ title: 'Sign in', headerShown: false }} />
          <Stack.Screen name="recipe/[id]" options={{ title: '' }} />
          <Stack.Screen name="cookbooks/index" options={{ title: 'Cookbooks' }} />
          <Stack.Screen name="cookbooks/[id]" options={{ title: '' }} />
        </Stack>
      </AuthProvider>
    </QueryClientProvider>
  );
}

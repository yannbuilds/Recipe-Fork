import { focusManager, onlineManager } from '@tanstack/react-query';
import { useNetworkState } from 'expo-network';
import { useEffect } from 'react';
import { AppState, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Body } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/lib/theme';

export default function Connectivity() {
  const network = useNetworkState();
  const offline = network.isConnected === false || network.isInternetReachable === false;
  const { user } = useAuth();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  useEffect(() => { onlineManager.setOnline(!offline); }, [offline]);
  useEffect(() => {
    focusManager.setFocused(AppState.currentState === 'active');
    const subscription = AppState.addEventListener('change', state => focusManager.setFocused(state === 'active'));
    return () => subscription.remove();
  }, []);
  if (!offline || !user) return null;
  return (
    <View accessibilityRole="alert" style={{ backgroundColor: theme.card, paddingTop: insets.top + 8, paddingBottom: 8, paddingHorizontal: 16 }}>
      <Body size={13} color={theme.muted}>You're offline. Saved content is available; changes need a connection.</Body>
    </View>
  );
}

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

// Tracks whether the first-run onboarding carousel has been seen. Persisted to
// AsyncStorage so it only ever shows once per install.

const ONBOARDING_KEY = 'recipe-fork-onboarding-complete';

interface OnboardingContextValue {
  /** True once the flag has been read from storage. */
  ready: boolean;
  /** Whether the user has already completed onboarding. */
  seen: boolean;
  markSeen: () => void;
  /** Clears the flag so the carousel shows again (used by a dev replay button). */
  reset: () => Promise<void>;
}

const OnboardingContext = createContext<OnboardingContextValue>({
  ready: false,
  seen: false,
  markSeen: () => {},
  reset: async () => {},
});

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [seen, setSeen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_KEY)
      .then((v) => setSeen(v === 'true'))
      .finally(() => setReady(true));
  }, []);

  const markSeen = useCallback(() => {
    setSeen(true);
    AsyncStorage.setItem(ONBOARDING_KEY, 'true').catch(() => {});
  }, []);

  const reset = useCallback(async () => {
    setSeen(false);
    await AsyncStorage.removeItem(ONBOARDING_KEY).catch(() => {});
  }, []);

  return (
    <OnboardingContext.Provider value={{ ready, seen, markSeen, reset }}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  return useContext(OnboardingContext);
}

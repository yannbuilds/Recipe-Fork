import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useColorScheme } from 'react-native';

// ── Pie Keeper editorial palette ────────────────────────────────
// Ported from packages/web/src/index.css so the mobile app follows the
// exact same warm-paper / espresso-ink / herb-green look, light and dark.

const light = {
  bg: '#ece4d3',
  card: '#fbf8f1',
  paper: '#f5efe2',
  paper2: '#fbf6ea',
  paper3: '#efe7d4',
  green: '#3d6b4e',
  greenDeep: '#2f5440',
  greenSolid: '#3d6b4e',
  greenLight: '#e5ecdf',
  warm: '#efe7d4',
  warmDark: '#e4dac4',
  border: 'rgba(31,27,22,0.14)',
  ruleSoft: 'rgba(31,27,22,0.07)',
  ruleHair: 'rgba(31,27,22,0.055)',
  text: '#1f1b16',
  textSoft: '#4a4339',
  muted: '#847a6b',
  red: '#b84a2b',
  redLight: '#f7e9e2',
  redBorder: 'rgba(184,74,43,0.35)',
  terracotta: '#c8633f',
  orange: '#c8633f',
  onGreen: '#fbf8f1',
};

const dark: typeof light = {
  bg: '#1c1917',
  card: '#262220',
  paper: '#211d1b',
  paper2: '#262220',
  paper3: '#2e2926',
  green: '#7fa98a',
  greenDeep: '#6b9678',
  greenSolid: '#4f7d5f',
  greenLight: '#2c3a30',
  warm: '#2e2926',
  warmDark: '#201c1a',
  border: 'rgba(245,239,226,0.14)',
  ruleSoft: 'rgba(245,239,226,0.09)',
  ruleHair: 'rgba(245,239,226,0.06)',
  text: '#f2eadb',
  textSoft: '#cfc6b5',
  muted: '#a79c88',
  red: '#e0785a',
  redLight: 'rgba(224,120,90,0.14)',
  redBorder: 'rgba(224,120,90,0.35)',
  terracotta: '#d9825e',
  orange: '#d9825e',
  onGreen: '#fbf8f1',
};

export type Theme = typeof light;

// Font family names as registered by @expo-google-fonts (see fonts.ts).
export const font = {
  serif: 'Newsreader_400Regular',
  serifItalic: 'Newsreader_400Regular_Italic',
  serifSemi: 'Newsreader_600SemiBold',
  sans: 'DMSans_400Regular',
  sansMedium: 'DMSans_500Medium',
  sansSemi: 'DMSans_600SemiBold',
  sansBold: 'DMSans_700Bold',
  mono: 'JetBrainsMono_400Regular',
  monoMedium: 'JetBrainsMono_500Medium',
} as const;

// ── Theme preference (System / Light / Dark) ────────────────────
// System follows the OS colour scheme; Light/Dark force one look.
// Persisted to AsyncStorage so the choice survives restarts.

export type ThemePreference = 'auto' | 'light' | 'dark';

const THEME_PREF_KEY = 'recipe-fork-theme-preference';

interface ThemePrefContextValue {
  preference: ThemePreference;
  setPreference: (pref: ThemePreference) => void;
}

const ThemePreferenceContext = createContext<ThemePrefContextValue>({
  preference: 'auto',
  setPreference: () => {},
});

export function ThemePreferenceProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>('auto');

  useEffect(() => {
    AsyncStorage.getItem(THEME_PREF_KEY).then((stored) => {
      if (stored === 'auto' || stored === 'light' || stored === 'dark') {
        setPreferenceState(stored);
      }
    });
  }, []);

  const setPreference = (pref: ThemePreference) => {
    setPreferenceState(pref);
    AsyncStorage.setItem(THEME_PREF_KEY, pref).catch(() => {});
  };

  return createElement(
    ThemePreferenceContext.Provider,
    { value: { preference, setPreference } },
    children,
  );
}

export function useThemePreference(): ThemePrefContextValue {
  return useContext(ThemePreferenceContext);
}

export function useTheme(): Theme {
  return useIsDark() ? dark : light;
}

export function useIsDark(): boolean {
  const system = useColorScheme();
  const { preference } = useContext(ThemePreferenceContext);
  if (preference === 'light') return false;
  if (preference === 'dark') return true;
  return system === 'dark';
}

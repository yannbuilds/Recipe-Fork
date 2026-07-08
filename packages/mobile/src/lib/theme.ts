import { useColorScheme } from 'react-native';

const light = {
  background: '#faf7f2',
  card: '#ffffff',
  text: '#1c1917',
  textSecondary: '#78716c',
  border: '#e7e0d8',
  accent: '#b45309',
  danger: '#b91c1c',
  inputBackground: '#ffffff',
};

const dark = {
  background: '#171412',
  card: '#221e1b',
  text: '#f5f0ea',
  textSecondary: '#a8a29e',
  border: '#3a332e',
  accent: '#f59e0b',
  danger: '#f87171',
  inputBackground: '#2a2522',
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

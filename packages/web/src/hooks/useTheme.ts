import { useEffect, useState } from 'react';
import { getSunTimes } from '../utils/sunlight';

export type ThemePreference = 'auto' | 'light' | 'dark';

const STORAGE_KEY = 'pk-theme-preference';
const CHANGE_EVENT = 'pk-theme-change';

export function getThemePreference(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' ? stored : 'auto';
}

export function setThemePreference(pref: ThemePreference) {
  if (pref === 'auto') {
    localStorage.removeItem(STORAGE_KEY);
  } else {
    localStorage.setItem(STORAGE_KEY, pref);
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

/** Reactive read of the current preference — for UI that reflects the choice. */
export function useThemePreference(): ThemePreference {
  const [pref, setPref] = useState<ThemePreference>(getThemePreference);
  useEffect(() => {
    const handler = () => setPref(getThemePreference());
    window.addEventListener(CHANGE_EVENT, handler);
    return () => window.removeEventListener(CHANGE_EVENT, handler);
  }, []);
  return pref;
}

function isDark(now: Date): boolean {
  const { sunrise, sunset } = getSunTimes(now);
  return now < sunrise || now >= sunset;
}

function applyTheme(dark: boolean) {
  document.documentElement.classList.toggle('dark', dark);

  // Update PWA theme-color meta tag
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', dark ? '#1a1a1e' : '#3f7358');
  }
}

function msUntil(target: Date, now: Date): number {
  return Math.max(target.getTime() - now.getTime(), 1000);
}

export function useTheme() {
  const pref = useThemePreference();

  useEffect(() => {
    // Manual light/dark — apply once, no scheduling.
    if (pref === 'light' || pref === 'dark') {
      applyTheme(pref === 'dark');
      return;
    }

    // Auto — follow local sunrise/sunset and reschedule at each transition.
    let timer: ReturnType<typeof setTimeout>;

    function update() {
      const now = new Date();
      const dark = isDark(now);
      applyTheme(dark);

      // Schedule next transition
      const { sunrise, sunset } = getSunTimes(now);

      let next: Date;
      if (now < sunrise) {
        next = sunrise;
      } else if (now < sunset) {
        next = sunset;
      } else {
        // After sunset — schedule for tomorrow's sunrise
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const { sunrise: tomorrowSunrise } = getSunTimes(tomorrow);
        next = tomorrowSunrise;
      }

      timer = setTimeout(update, msUntil(next, now));
    }

    update();

    return () => clearTimeout(timer);
  }, [pref]);
}

import { useEffect } from 'react';
import { getSunTimes } from '../utils/sunlight';

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
  useEffect(() => {
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
  }, []);
}

// Display helpers for the mobile app.
//
// Quantity scaling used to be a copy of the web util; it now lives in
// packages/shared/src/scaling.ts (the sub-recipe expansion needs it too) and is
// re-exported here so existing imports keep working.

export { scaleQuantity, scaleIngredientsForServings } from '@recipe-aggregator/shared/scaling';

export function formatTime(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

export function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'Source';
  }
}

// Splits a title so the last word can be rendered italic-green (editorial flourish).
export function accentTitle(title: string): { head: string; last: string | null } {
  const words = title.trim().split(/\s+/);
  if (words.length < 2) return { head: title, last: null };
  return { head: words.slice(0, -1).join(' '), last: words[words.length - 1] };
}

// Lowercase roman numeral for group labels (i, ii, iii …).
export function toRoman(n: number): string {
  const map: [number, string][] = [
    [10, 'x'],
    [9, 'ix'],
    [5, 'v'],
    [4, 'iv'],
    [1, 'i'],
  ];
  let out = '';
  for (const [v, s] of map) {
    while (n >= v) {
      out += s;
      n -= v;
    }
  }
  return out;
}

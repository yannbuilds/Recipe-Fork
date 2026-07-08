// Quantity scaling + formatting helpers, ported from packages/web RecipeDetail.

function parseFraction(q: string): number | null {
  const parts = q.trim().split(/\s+/);
  let total = 0;
  let parsedAny = false;
  for (const p of parts) {
    if (p.includes('/')) {
      const [num, den] = p.split('/').map(Number);
      if (isNaN(num) || isNaN(den) || den === 0) break;
      total += num / den;
      parsedAny = true;
    } else {
      const n = Number(p);
      if (!isNaN(n)) {
        total += n;
        parsedAny = true;
      } else {
        const leading = p.match(/^(\d+(?:\.\d+)?)/);
        if (leading) {
          total += Number(leading[1]);
          parsedAny = true;
        }
        break;
      }
    }
  }
  return parsedAny ? total : null;
}

const COMMON_FRACTIONS: [number, string][] = [
  [0.125, '1/8'],
  [0.25, '1/4'],
  [0.333, '1/3'],
  [0.5, '1/2'],
  [0.667, '2/3'],
  [0.75, '3/4'],
];

function formatQuantity(value: number): string {
  const whole = Math.floor(value);
  const frac = value - whole;
  for (const [target, label] of COMMON_FRACTIONS) {
    if (Math.abs(frac - target) < 0.02) {
      return whole > 0 ? `${whole} ${label}` : label;
    }
  }
  if (value % 1 === 0) return String(value);
  return value.toFixed(1);
}

export function scaleQuantity(
  quantity: string,
  originalServings: number | null,
  currentServings: number,
): string {
  if (!originalServings || originalServings === 0) return quantity;
  const parsed = parseFraction(quantity);
  if (parsed === null) return quantity;
  const scaled = parsed * (currentServings / originalServings);
  const suffixMatch = quantity.match(/[a-zA-Z]+$/);
  const suffix = suffixMatch ? suffixMatch[0] : '';
  return formatQuantity(scaled) + suffix;
}

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

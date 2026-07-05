// Pie Keeper — editorial cookbook design tokens.
// These map the design's named tones to the app's CSS custom properties so that
// every editorial component follows the global light/dark theme automatically.
// The raw hex values live in index.css (:root and .dark).

export const PK = {
  ink: 'var(--text)',
  inkSoft: 'var(--text-soft)',
  inkMute: 'var(--muted)',
  paper: 'var(--paper)',
  paper2: 'var(--paper2)',
  paper3: 'var(--paper3)',
  cream: 'var(--card)',
  rule: 'var(--border)',
  ruleSoft: 'var(--rule-soft)',
  ruleHair: 'var(--rule-hair)',
  green: 'var(--green)',
  greenDeep: 'var(--green-deep)',
  greenSoft: 'var(--green-light)',
  terracotta: 'var(--terracotta)',
  red: 'var(--red)',
} as const;

export const fSerif = '"Newsreader", "Source Serif 4", Georgia, serif';
export const fSans = '"DM Sans", system-ui, -apple-system, sans-serif';
export const fMono = '"JetBrains Mono", ui-monospace, Menlo, monospace';

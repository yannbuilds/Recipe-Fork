// Pie Keeper — editorial cookbook design tokens.
// Page-scoped: imported by the Cookbooks list view only (not global). Ported
// verbatim from the Claude Design handoff (~/Downloads/pie-keeper). As more
// pages adopt the language, reuse these tokens rather than duplicating hexes.

export const PK = {
  ink: '#1F1B16',
  inkSoft: '#4A4339',
  inkMute: '#847A6B',
  paper: '#F5EFE2',
  paper2: '#FBF6EA',
  paper3: '#EFE7D4',
  cream: '#FBF8F1',
  rule: '#1F1B1620',
  ruleSoft: '#1F1B1612',
  ruleHair: '#1F1B160E',
  green: '#3D6B4E',
  greenDeep: '#2F5440',
  greenSoft: '#E5ECDF',
  terracotta: '#C8633F',
  red: '#B84A2B',
} as const;

export const fSerif = '"Newsreader", "Source Serif 4", Georgia, serif';
export const fSans = '"DM Sans", system-ui, -apple-system, sans-serif';
export const fMono = '"JetBrains Mono", ui-monospace, Menlo, monospace';

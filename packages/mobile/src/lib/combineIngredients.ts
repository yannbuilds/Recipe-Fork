import type { Ingredient } from '@recipe-aggregator/shared';

/*
 * Shopping-list aggregation.
 *
 * Recipes describe the same ingredient a dozen different ways — "garlic",
 * "3 garlic cloves", "garlic, finely chopped", "2 tbsp minced garlic". A naive
 * exact-string match lists those as four things to buy. This module reduces each
 * ingredient to a canonical key so they land in one row, then sums the amounts
 * per measurement family (mass / volume / count) so the number is meaningful.
 *
 * Two rules keep it honest:
 *  - Amounts only combine inside a family. "2 tbsp + 3 cloves" is shown as-is
 *    rather than invented into a single figure.
 *  - An ingredient with no amount ("salt", "olive oil") contributes nothing —
 *    it must never turn a real total into 0.
 *
 * Kept deliberately in sync with packages/web/src/utils/combineIngredients.ts.
 */

export interface IngredientSource {
  recipeTitle: string;
  recipeId: string;
  quantity: string;
  unit: string;
}

export interface AggregatedIngredient {
  item: string;
  quantity: string;
  unit: string;
  shoppingCategory?: string;
  sources: IngredientSource[];
}

export interface IngredientWithRecipe extends Ingredient {
  _recipeTitle: string;
  _recipeId: string;
}

/* ------------------------------------------------------------------ */
/*  Quantity parsing                                                   */
/* ------------------------------------------------------------------ */

const UNICODE_FRACTIONS: Record<string, number> = {
  '¼': 0.25, '½': 0.5, '¾': 0.75,
  '⅓': 1 / 3, '⅔': 2 / 3,
  '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8,
  '⅙': 1 / 6, '⅚': 5 / 6,
  '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875,
};

// Expands "1½" to "1 0.5" so the token walker can just add the pieces up.
function expandUnicodeFractions(s: string): string {
  let out = '';
  for (const ch of s) {
    out += ch in UNICODE_FRACTIONS ? ` ${UNICODE_FRACTIONS[ch]} ` : ch;
  }
  return out;
}

// Sums a run of numeric tokens: "1 1/2" → 1.5, "0.75" → 0.75. Stops at the
// first token that isn't a number, so "2 large" still yields 2.
function parseNumeric(raw: string): number | null {
  const tokens = expandUnicodeFractions(raw).trim().split(/\s+/);
  let total = 0;
  let matched = false;

  for (const token of tokens) {
    const fraction = token.match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
    if (fraction) {
      const den = Number(fraction[2]);
      if (den === 0) break;
      total += Number(fraction[1]) / den;
      matched = true;
      continue;
    }
    const plain = token.match(/^(\d+(?:\.\d+)?)/);
    if (plain) {
      total += Number(plain[1]);
      matched = true;
      // "750g" — the number is glued to a unit, so nothing after it is numeric.
      if (plain[1].length !== token.length) break;
      continue;
    }
    break;
  }

  return matched ? total : null;
}

// Sites aimed at two audiences write the amount twice: "500g / 1lb",
// "14 oz / 400g". Keep the first measure and drop the conversion — but leave
// plain fractions like "1/2" and "1 1/2" alone.
function dropDualMeasure(raw: string): string {
  const separator = raw.search(/(?:[a-zA-Z]\s*\/|\s\/|\/\s)/);
  return separator >= 0 ? raw.slice(0, separator + 1).trim() : raw.trim();
}

// Ranges ("1-2 onions", "2 to 3 tbsp") resolve to the upper bound — better to
// have a little too much than to come home short.
function parseQuantity(raw: string): number | null {
  const text = dropDualMeasure(raw);
  if (!text) return null;

  const range = text.split(/\s*(?:-|–|—|\bto\b|\bor\b)\s*/i).filter(Boolean);
  if (range.length === 2) {
    const lo = parseNumeric(range[0]);
    const hi = parseNumeric(range[1]);
    if (lo !== null && hi !== null) return Math.max(lo, hi);
  }

  return parseNumeric(text);
}

// Pulls the unit out of quantities that carry it inline: "750g" → "g",
// "500g / 1lb" → "g", "14 oz / 400g" → "oz".
function inlineUnit(raw: string): string {
  const match = dropDualMeasure(raw).match(/[\d\s./]\s*([a-zA-Z]+)\s*$/);
  return match ? match[1] : '';
}

/* ------------------------------------------------------------------ */
/*  Units                                                              */
/* ------------------------------------------------------------------ */

type Family = 'mass' | 'volume' | 'count' | 'other';

interface UnitDef {
  family: Family;
  /** How many base units (g for mass, ml for volume, 1 for count) this is worth. */
  base: number;
  label: string;
}

// Spoon and cup sizes vary by country; these are the values most recipe sites
// publish against. They only ever matter when one ingredient mixes units.
const UNITS: Record<string, UnitDef> = {};

function defineUnit(def: UnitDef, ...aliases: string[]) {
  for (const alias of aliases) UNITS[alias] = def;
}

defineUnit({ family: 'mass', base: 1, label: 'g' }, 'g', 'gs', 'gr', 'gm', 'gms', 'gram', 'grams', 'gramme', 'grammes');
defineUnit({ family: 'mass', base: 1000, label: 'kg' }, 'kg', 'kgs', 'kilo', 'kilos', 'kilogram', 'kilograms');
defineUnit({ family: 'mass', base: 0.001, label: 'mg' }, 'mg', 'mgs', 'milligram', 'milligrams');
defineUnit({ family: 'mass', base: 28.3495, label: 'oz' }, 'oz', 'ozs', 'ounce', 'ounces');
defineUnit({ family: 'mass', base: 453.592, label: 'lb' }, 'lb', 'lbs', 'pound', 'pounds');

defineUnit({ family: 'volume', base: 1, label: 'ml' }, 'ml', 'mls', 'millilitre', 'millilitres', 'milliliter', 'milliliters', 'cc');
defineUnit({ family: 'volume', base: 1000, label: 'L' }, 'l', 'ltr', 'litre', 'litres', 'liter', 'liters');
defineUnit({ family: 'volume', base: 5, label: 'tsp' }, 'tsp', 'tsps', 'teaspoon', 'teaspoons');
defineUnit({ family: 'volume', base: 15, label: 'tbsp' }, 'tbsp', 'tbsps', 'tbs', 'tbl', 'tbls', 'tablespoon', 'tablespoons');
defineUnit({ family: 'volume', base: 10, label: 'dsp' }, 'dsp', 'dessertspoon', 'dessertspoons');
defineUnit({ family: 'volume', base: 250, label: 'cup' }, 'cup', 'cups');
defineUnit({ family: 'volume', base: 30, label: 'fl oz' }, 'floz', 'fl oz', 'fl', 'fluid ounce', 'fluid ounces');
defineUnit({ family: 'volume', base: 568, label: 'pint' }, 'pint', 'pints', 'pt');
defineUnit({ family: 'volume', base: 946, label: 'quart' }, 'quart', 'quarts', 'qt');

// Units that are really just "how you count this thing". A recipe writing
// "3 cloves garlic" and another writing "3 garlic cloves" (unit lost into the
// name) must land on the same total, so these all fold into a bare count.
defineUnit(
  { family: 'count', base: 1, label: '' },
  '', 'clove', 'cloves', 'piece', 'pieces', 'slice', 'slices', 'leaf', 'leaves',
  'sprig', 'sprigs', 'stalk', 'stalks', 'stick', 'sticks', 'fillet', 'fillets',
  'rasher', 'rashers', 'ear', 'ears', 'wedge', 'wedges', 'whole',
  'rib', 'ribs', 'stem', 'stems', 'sheet', 'sheets',
  // Scraped unit fields are frequently a size or freshness word rather than a
  // measure. They describe one item, so they count as one.
  'large', 'small', 'medium', 'big', 'fresh', 'ripe', 'thick', 'thin', 'x',
);

// Everything else (containers, vague amounts) keeps its own bucket — a can of
// tomatoes and a loose tomato are not the same purchase.
const OTHER_UNITS: Record<string, string> = {
  can: 'can', cans: 'can', tin: 'can', tins: 'can',
  jar: 'jar', jars: 'jar',
  packet: 'packet', packets: 'packet', pack: 'packet', packs: 'packet', sachet: 'sachet', sachets: 'sachet',
  punnet: 'punnet', punnets: 'punnet',
  bunch: 'bunch', bunches: 'bunch',
  bag: 'bag', bags: 'bag',
  box: 'box', boxes: 'box',
  bottle: 'bottle', bottles: 'bottle',
  block: 'block', blocks: 'block',
  tub: 'tub', tubs: 'tub',
  head: 'head', heads: 'head',
  bulb: 'bulb', bulbs: 'bulb',
  handful: 'handful', handfuls: 'handful',
  pinch: 'pinch', pinches: 'pinch',
  dash: 'dash', dashes: 'dash',
  drop: 'drop', drops: 'drop',
  knob: 'knob', knobs: 'knob',
  splash: 'splash', splashes: 'splash',
};

interface ResolvedUnit {
  family: Family;
  base: number;
  label: string;
  /** Amounts only ever sum within a bucket. */
  bucket: string;
}

function resolveUnit(raw: string): ResolvedUnit {
  const key = raw.toLowerCase().trim().replace(/\./g, '');

  const known = UNITS[key];
  if (known) return { ...known, bucket: known.family };

  const other = OTHER_UNITS[key];
  if (other) return { family: 'other', base: 1, label: other, bucket: `other:${other}` };

  // Scrapers emit compound units for dual-measurement recipes: "750 g/lb",
  // "140 g/cup", "1 litre/cup". Take the first real measure in the string —
  // treating "750 g/lb" as a count would claim you need 750 chicken thighs.
  for (const token of key.split(/[^a-z]+/)) {
    if (!token) continue;
    const inner = UNITS[token];
    if (inner) return { ...inner, bucket: inner.family };
    const innerOther = OTHER_UNITS[token];
    if (innerOther) return { family: 'other', base: 1, label: innerOther, bucket: `other:${innerOther}` };
  }

  // Anything left is noise — "2 grinds of pepper", "a splodge". It describes one
  // item, so count it as one rather than stranding it in a row of its own.
  return { family: 'count', base: 1, label: '', bucket: 'count' };
}

/* ------------------------------------------------------------------ */
/*  Ingredient name canonicalisation                                   */
/* ------------------------------------------------------------------ */

// Words describing how an ingredient is prepared or presented. They never change
// what goes in the trolley, so they're dropped before matching.
const NOISE_WORDS = new Set([
  'fresh', 'freshly', 'finely', 'roughly', 'coarsely', 'thinly', 'thickly', 'lightly',
  'chopped', 'minced', 'diced', 'sliced', 'grated', 'shredded', 'crushed', 'mashed',
  'peeled', 'halved', 'quartered', 'torn', 'trimmed', 'drained', 'rinsed', 'washed',
  'softened', 'melted', 'beaten', 'packed', 'loosely', 'firmly', 'julienned', 'cubed',
  'optional', 'divided', 'plus', 'more', 'extra', 'about', 'approximately', 'roughly',
  'good', 'quality', 'large', 'small', 'medium', 'big', 'ripe', 'nice',
  'cut', 'pre-cut', 'precut', 'into', 'thin', 'thick', 'rounds', 'wedges', 'strips', 'chunks',
  'of', 'a', 'an', 'the', 'your', 'own', 'and',
  // "1/4 tsp EACH black pepper and cayenne" — a recipe-writing device, not a word
  // about the ingredient.
  'each', 'per',
]);

// Nouns that are really "how you count it" trailing the ingredient name.
const TRAILING_COUNT_NOUNS = new Set([
  'clove', 'cloves', 'leaf', 'leaves', 'sprig', 'sprigs', 'stalk', 'stalks',
  'stick', 'sticks', 'fillet', 'fillets', 'rasher', 'rashers', 'slice', 'slices',
  'piece', 'pieces', 'head', 'heads', 'bulb', 'bulbs', 'rib', 'ribs', 'stem', 'stems',
]);

const IRREGULAR_SINGULARS: Record<string, string> = {
  leaves: 'leaf', loaves: 'loaf', halves: 'half', knives: 'knife',
  potatoes: 'potato', tomatoes: 'tomato', mangoes: 'mango', avocadoes: 'avocado',
  chillies: 'chilli', chilies: 'chilli', berries: 'berry', cherries: 'cherry',
  anchovies: 'anchovy', pastries: 'pastry', curries: 'curry',
  feet: 'foot', teeth: 'tooth', geese: 'goose',
};

// Words that simply end in "s" — stripping it would mangle them.
const NEVER_SINGULARISE = new Set([
  'hummus', 'couscous', 'asparagus', 'molasses', 'watercress', 'cress', 'bass',
  'swiss', 'grass', 'glass', 'bass', 'gas', 'os', 'is', 'as', 'greens', 'oats',
]);

function singularise(word: string): string {
  if (IRREGULAR_SINGULARS[word]) return IRREGULAR_SINGULARS[word];
  if (NEVER_SINGULARISE.has(word) || word.length < 4) return word;
  if (/(ss|us|is)$/.test(word)) return word;
  if (/ies$/.test(word)) return `${word.slice(0, -3)}y`;
  if (/(ch|sh|x|z|s)es$/.test(word)) return word.slice(0, -2);
  if (/oes$/.test(word)) return word.slice(0, -2);
  if (/s$/.test(word)) return word.slice(0, -1);
  return word;
}

// Single words that mean the same thing wherever they appear in a name.
const TOKEN_SYNONYMS: Record<string, string> = {
  cilantro: 'coriander',
  scallion: 'spring onion',
  chile: 'chilli',
  chili: 'chilli',
  yogurt: 'yoghurt',
  aubergine: 'eggplant',
  courgette: 'zucchini',
  shrimp: 'prawn',
  arugula: 'rocket',
  garbanzo: 'chickpea',
  eschalot: 'shallot',
  eschallot: 'shallot',
  eshalot: 'shallot',
  // "can crushed tomato" and "canned crushed tomatoes" are one purchase — and
  // neither is the same as a fresh tomato, so the word has to survive.
  can: 'canned',
  tin: 'canned',
  tinned: 'canned',
};

// Whole-name equivalences. Kept separate from the token map because these are
// only safe as a complete match — "plain" alone means flour, "plain yoghurt"
// certainly does not.
const PHRASE_SYNONYMS: Record<string, string> = {
  'green onion': 'spring onion',
  'bell pepper': 'capsicum',
  'sweet pepper': 'capsicum',
  'garbanzo bean': 'chickpea',
  'ground beef': 'beef mince',
  'minced beef': 'beef mince',
  'ground pork': 'pork mince',
  'minced pork': 'pork mince',
  'ground chicken': 'chicken mince',
  'ground lamb': 'lamb mince',
  plain: 'plain flour',
  'all purpose flour': 'plain flour',
  'all-purpose flour': 'plain flour',
  'powdered sugar': 'icing sugar',
  'confectioners sugar': 'icing sugar',
  'castor sugar': 'caster sugar',
  'superfine sugar': 'caster sugar',
  'baking soda': 'bicarbonate of soda',
  'bicarb soda': 'bicarbonate of soda',
  // One salt row beats three. Flaky and sea salt stay separate — you buy those
  // for a different job.
  cooking: 'salt',
  'cooking salt': 'salt',
  'kosher salt': 'salt',
  'table salt': 'salt',
};

// Trims a name down to the part that identifies the product: no bracketed
// asides, no "…, finely chopped" tail, no "or do your own" alternatives.
const ACCENTS: Record<string, string> = {
  à: 'a', á: 'a', â: 'a', ã: 'a', ä: 'a', å: 'a',
  è: 'e', é: 'e', ê: 'e', ë: 'e',
  ì: 'i', í: 'i', î: 'i', ï: 'i',
  ò: 'o', ó: 'o', ô: 'o', õ: 'o', ö: 'o',
  ù: 'u', ú: 'u', û: 'u', ü: 'u',
  ñ: 'n', ç: 'c',
};

function foldAccents(s: string): string {
  let out = '';
  for (const ch of s) out += ACCENTS[ch] ?? ch;
  return out;
}

function trimToHead(raw: string): string {
  let text = foldAccents(raw.toLowerCase()); // "jalapeño" must meet "jalapeno"
  text = text.replace(/&[a-z]+;|&#\d+;/g, ' '); // scraped HTML entities
  text = text.replace(/\([^)]*\)/g, ' ');
  text = text.replace(/^[\s\-–—•*]+/, '');
  text = text.split(/\s*[,;]\s*/)[0];
  text = text.split(/\s+[–—-]\s+/)[0];
  text = text.split(/\s+\bto taste\b/)[0];
  text = text.split(/\s+\b(?:for|to)\s+(?:serve|serving|garnish|garnishing|frying|dusting|drizzling|brushing)\b/)[0];
  // Recipe sites love naming both regional variants: "chicken stock/broth",
  // "capsicum/bell peppers", "cooking salt / kosher salt". Drop the alternative.
  // Matched between letters so fractions like "1/2" survive.
  const slash = text.search(/[a-z]\s*\/\s*[a-z]/);
  if (slash >= 0) {
    const cut = text.indexOf('/', slash);
    const left = text.slice(0, cut).trim();
    const right = text.slice(cut + 1).trim();
    const leftWords = left.split(/\s+/);
    const rightWords = right.split(/\s+/);
    // "cooking / kosher salt" — the shared noun sits after the alternative, so
    // carry it back. Anything longer is too ambiguous to guess at.
    text = leftWords.length === 1 && rightWords.length === 2
      ? `${left} ${rightWords[1]}`
      : left;
  }
  text = text.replace(/[^a-z0-9%\s-]/g, ' ');
  return text.replace(/\s+/g, ' ').trim();
}

// When the unit column is empty, the measure is sometimes the first word of the
// name instead. canonicalItem already strips it, so read it before that happens.
function leadingUnitInName(raw: string): string {
  const first = trimToHead(raw || '')
    .split(/\s+/)
    .filter((t) => t && !/^\d+(\.\d+)?%?$/.test(t))[0];
  return first && first in UNITS ? first : '';
}

/** Exported for the aggregation test suite — not used by the app. */
export function canonicalItem(raw: string): string {
  const head = trimToHead(raw);
  if (!head) return raw.toLowerCase().trim();

  let tokens = head
    .split(/\s+/)
    .filter((t) => t && !NOISE_WORDS.has(t) && !/^\d+(\.\d+)?%?$/.test(t));

  // Some scrapers leave the measure inside the name ("2 tbsp lemon juice",
  // "- 5 slices ginger"). The numbers are already gone; drop the leftover unit.
  // Container words are deliberately not stripped — see TOKEN_SYNONYMS.can.
  while (tokens.length > 1 && tokens[0] in UNITS) {
    tokens = tokens.slice(1);
  }

  // "garlic cloves" → "garlic", but never strip a lone "leaves"/"cloves".
  while (tokens.length > 1 && TRAILING_COUNT_NOUNS.has(tokens[tokens.length - 1])) {
    tokens = tokens.slice(0, -1);
  }

  tokens = tokens.map(singularise).map((t) => TOKEN_SYNONYMS[t] ?? t);
  if (tokens.length === 0) return head;

  const joined = tokens.join(' ');
  return PHRASE_SYNONYMS[joined] ?? joined;
}

// The label shown on the list: the shortest name any recipe used, minus the
// bracketed asides and the "…, finely chopped" tail. When a regional synonym is
// in play ("green onions" vs "spring onion") the canonical spelling wins, so the
// same set of recipes always produces the same label.
function displayName(originals: string[], canonical: string): string {
  const cleaned = originals.map((raw) => {
    const stripped = raw
      .replace(/\([^)]*\)/g, ' ')
      .split(/\s*[,;]\s*/)[0]
      .replace(/\s+/g, ' ')
      .trim();
    return stripped.length >= 2 ? stripped : raw.trim();
  });
  const shortest = (list: string[]) =>
    list.reduce((best, next) => (next.length < best.length ? next : best), list[0]);

  const canonicalMatches = cleaned.filter((c) => c.toLowerCase() === canonical);
  return canonicalMatches.length > 0 ? shortest(canonicalMatches) : shortest(cleaned);
}

/* ------------------------------------------------------------------ */
/*  Amount formatting                                                  */
/* ------------------------------------------------------------------ */

const COMMON_FRACTIONS: [number, string][] = [
  [0.125, '1/8'], [0.25, '1/4'], [1 / 3, '1/3'], [0.375, '3/8'], [0.5, '1/2'],
  [0.625, '5/8'], [2 / 3, '2/3'], [0.75, '3/4'], [0.875, '7/8'],
];

// Spoons, cups and whole items read better as fractions than as decimals —
// "1 1/2 tbsp" beats "1.5 tbsp" on a list you glance at in a supermarket.
function formatFraction(value: number): string {
  const whole = Math.floor(value + 1e-9);
  const frac = value - whole;
  if (frac < 0.02) return String(whole);
  for (const [target, label] of COMMON_FRACTIONS) {
    if (Math.abs(frac - target) < 0.03) {
      return whole > 0 ? `${whole} ${label}` : label;
    }
  }
  return trimDecimal(value);
}

function trimDecimal(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return String(Number(rounded.toFixed(2)));
}

const FRACTION_FRIENDLY = new Set(['tsp', 'tbsp', 'dsp', 'cup', '']);

function formatAmount(totalBase: number, unit: ResolvedUnit): { quantity: string; unit: string } {
  let label = unit.label;
  let value = totalBase / unit.base;

  // Show the amount at a scale a human would write it at.
  if (unit.family === 'mass') {
    if (label === 'g' && totalBase >= 1000) { label = 'kg'; value = totalBase / 1000; }
    else if (label === 'kg' && totalBase < 1000) { label = 'g'; value = totalBase; }
  } else if (unit.family === 'volume') {
    if (label === 'ml' && totalBase >= 1000) { label = 'L'; value = totalBase / 1000; }
    else if (label === 'L' && totalBase < 1000) { label = 'ml'; value = totalBase; }
  }

  const quantity = FRACTION_FRIENDLY.has(label) ? formatFraction(value) : trimDecimal(value);
  return { quantity, unit: label };
}

/* ------------------------------------------------------------------ */
/*  Aggregation                                                        */
/* ------------------------------------------------------------------ */

// Measured amounts lead, then bare counts, then packaging: "1 tbsp + 3", "3 + 2 can".
const FAMILY_ORDER: Record<Family, number> = { mass: 0, volume: 1, count: 2, other: 3 };

interface Bucket {
  totalBase: number;
  /** Display unit is whichever one contributed the most, so a list of tbsp stays tbsp. */
  unitTotals: Map<string, { unit: ResolvedUnit; base: number }>;
}

interface Group {
  originals: string[];
  buckets: Map<string, Bucket>;
  sources: IngredientSource[];
  order: number;
}

export function combineIngredients(ingredients: IngredientWithRecipe[]): AggregatedIngredient[] {
  const groups = new Map<string, Group>();

  ingredients.forEach((ing, index) => {
    if (!ing.item || !ing.item.trim()) return;

    const key = canonicalItem(ing.item);
    let group = groups.get(key);
    if (!group) {
      group = { originals: [], buckets: new Map(), sources: [], order: index };
      groups.set(key, group);
    }

    group.originals.push(ing.item.trim());
    group.sources.push({
      recipeTitle: ing._recipeTitle,
      recipeId: ing._recipeId,
      quantity: ing.quantity,
      unit: ing.unit,
    });

    const value = parseQuantity(ing.quantity || '');
    // No amount means "to taste" — it contributes nothing rather than zero.
    if (value === null) return;

    // The measure can end up in any of three fields depending on the scraper:
    // its own column, glued to the quantity, or stranded at the head of the name
    // ("g/ 1 lb ground beef"). Without this, 500 g of mince reads as 500 items.
    const unit = resolveUnit(
      ing.unit || inlineUnit(ing.quantity || '') || leadingUnitInName(ing.item),
    );
    let bucket = group.buckets.get(unit.bucket);
    if (!bucket) {
      bucket = { totalBase: 0, unitTotals: new Map() };
      group.buckets.set(unit.bucket, bucket);
    }

    const contribution = value * unit.base;
    bucket.totalBase += contribution;

    const seen = bucket.unitTotals.get(unit.label);
    if (seen) seen.base += contribution;
    else bucket.unitTotals.set(unit.label, { unit, base: contribution });
  });

  const result: AggregatedIngredient[] = [];

  for (const [canonical, group] of groups) {
    const parts: { quantity: string; unit: string; rank: number }[] = [];

    for (const bucket of group.buckets.values()) {
      if (bucket.totalBase === 0) continue;
      const dominant = [...bucket.unitTotals.values()].reduce((best, next) =>
        next.base > best.base ? next : best,
      );
      parts.push({ ...formatAmount(bucket.totalBase, dominant.unit), rank: FAMILY_ORDER[dominant.unit.family] });
    }
    // Loose amounts read first, packaged ones last: "3 + 2 can", not "2 can + 3".
    parts.sort((a, b) => a.rank - b.rank);

    const item = displayName(group.originals, canonical);

    if (parts.length === 0) {
      result.push({ item, quantity: '', unit: '', sources: group.sources });
    } else if (parts.length === 1) {
      result.push({ item, quantity: parts[0].quantity, unit: parts[0].unit, sources: group.sources });
    } else {
      // Genuinely different measures — show them side by side instead of faking a total.
      const combined = parts
        .map((p) => `${p.quantity}${p.unit ? ` ${p.unit}` : ''}`)
        .join(' + ');
      result.push({ item, quantity: combined, unit: '', sources: group.sources });
    }
  }

  return result.sort((a, b) => a.item.localeCompare(b.item));
}

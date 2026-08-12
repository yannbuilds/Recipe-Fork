/*
 * Your own items on the shopping list.
 *
 * Every other line on the list is derived — an ingredient of something planned
 * for the week. These are the ones you add yourself: bin bags, milk, the thing
 * you ran out of this morning. They live in `meal_plans.custom_items`, belong
 * to that week only, and are otherwise treated exactly like a recipe line: same
 * aisle grouping, same tick-off, same struck-through settle out of the list.
 *
 * The whole module is pure, so both apps parse a typed line identically.
 */

/** One hand-added line. `id` is its only stable identity: the tick-off key is
 *  `custom:<id>`, which is what lets an item be renamed without coming
 *  unticked. */
export interface CustomShoppingItem {
  id: string;
  item: string;
  /** Free text, exactly as typed ("2", "1.5", "½"). Empty means no amount. */
  quantity: string;
  /** Canonical short unit ("g", "kg", "can"), or empty for a bare count. */
  unit: string;
  created_at: string;
}

/** How a hand-added line is identified in `meal_plans.checked_items`.
 *  Deliberately unlike the `<item>-<unit>` key recipe lines use, so the two
 *  can never collide and an existing week's ticks survive this feature. */
export function customItemKey(id: string): string {
  return `custom:${id}`;
}

/** Ids only have to be unique inside one week's list, and this has to run on
 *  Hermes, where `crypto.randomUUID` doesn't exist. */
function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const FRACTIONS = '¼½¾⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞';

// Longest form first: "1 1/2" has to win over "1" or the halves are lost.
const QUANTITY = new RegExp(
  `^(\\d+\\s+\\d+\\s*/\\s*\\d+|\\d+\\s*/\\s*\\d+|\\d*\\s*[${FRACTIONS}]|\\d+(?:[.,]\\d+)?)\\s*`,
);

/*
 * Units worth recognising when they lead a typed line. Keys are what people
 * type, values are what gets shown. Anything not in here is part of the item's
 * name, which is the right default — "3 bananas" must not read as 3 "banana"s
 * of nothing.
 */
const UNITS: Record<string, string> = {
  g: 'g', gram: 'g', grams: 'g', gm: 'g', gms: 'g',
  kg: 'kg', kilo: 'kg', kilos: 'kg', kilogram: 'kg', kilograms: 'kg',
  mg: 'mg',
  ml: 'ml', millilitre: 'ml', millilitres: 'ml', milliliter: 'ml', milliliters: 'ml',
  l: 'l', litre: 'l', litres: 'l', liter: 'l', liters: 'l',
  oz: 'oz', ounce: 'oz', ounces: 'oz',
  lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
  tsp: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp',
  tbsp: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp',
  cup: 'cup', cups: 'cup',
  clove: 'clove', cloves: 'clove',
  can: 'can', cans: 'can', tin: 'tin', tins: 'tin',
  jar: 'jar', jars: 'jar',
  bottle: 'bottle', bottles: 'bottle',
  pack: 'pack', packs: 'pack', packet: 'pack', packets: 'pack',
  box: 'box', boxes: 'box',
  bag: 'bag', bags: 'bag',
  punnet: 'punnet', punnets: 'punnet',
  bunch: 'bunch', bunches: 'bunch',
  head: 'head', heads: 'head',
  slice: 'slice', slices: 'slice',
  pinch: 'pinch', pinches: 'pinch',
  handful: 'handful', handfuls: 'handful',
  dozen: 'dozen',
};

/*
 * Units that can't be the thing you're buying. "2 cans" is a perfectly good
 * shopping line — two cans of whatever you meant — but "500 g" is 500 grams of
 * nothing, so that one falls back to showing exactly what was typed.
 */
const MEASURES = new Set(['g', 'kg', 'mg', 'ml', 'l', 'oz', 'lb', 'tsp', 'tbsp', 'pinch', 'handful']);

/**
 * Split a typed line into an amount and a thing to buy.
 *
 * Reads only a *leading* amount, which is how a shopping list gets typed:
 *   "milk"            → milk
 *   "2 avocados"      → 2 · avocados
 *   "500g pasta"      → 500 g · pasta
 *   "1 1/2 cups rice" → 1 1/2 cup · rice
 *   "2 x tins beans"  → 2 tin · beans
 *   "1 bag of rice"   → 1 bag · rice
 *
 * The item name is never allowed to come out empty: a line that is nothing but
 * an amount ("2", "500g") is taken at face value as the thing itself, because
 * whatever the user meant, it wasn't "buy 500 g of nothing".
 */
export function parseShoppingLine(text: string): { item: string; quantity: string; unit: string } {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (!trimmed) return { item: '', quantity: '', unit: '' };

  const amount = trimmed.match(QUANTITY);
  if (!amount) return { item: trimmed, quantity: '', unit: '' };

  const quantity = amount[1].replace(/\s*\/\s*/, '/').replace(',', '.').trim();
  let rest = trimmed.slice(amount[0].length);

  // "2 x 6 eggs" — the multiplication sign is noise once the 2 is banked.
  rest = rest.replace(/^[x×]\s+/i, '');

  let unit = '';
  const word = rest.match(/^([A-Za-z]+)\.?(?=\s|$)/);
  if (word) {
    const canonical = UNITS[word[1].toLowerCase()];
    const after = rest.slice(word[0].length).replace(/^\s+of\b/i, '').trim();
    if (canonical && after) {
      unit = canonical;
      rest = after;
    } else if (canonical && MEASURES.has(canonical)) {
      // "500g" — an amount and no thing. Blanked so it falls through to the
      // take-it-as-typed branch below.
      rest = '';
    }
    // Anything else with nothing after it is the thing itself: "2 cans" buys
    // two cans, "2 cans tomatoes" buys tomatoes.
  }

  const item = rest.trim();
  return item ? { item, quantity, unit } : { item: trimmed, quantity: '', unit: '' };
}

/** Build a hand-added item from a line of typed text. Returns null when there
 *  is nothing to add, so callers can treat "committed an empty row" as a no-op
 *  without repeating the check. */
export function makeCustomItem(text: string): CustomShoppingItem | null {
  const { item, quantity, unit } = parseShoppingLine(text);
  if (!item) return null;
  return { id: makeId(), item, quantity, unit, created_at: new Date().toISOString() };
}

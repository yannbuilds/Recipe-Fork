import assert from 'node:assert/strict';
import { combineIngredients } from '../packages/web/src/utils/combineIngredients.ts';
import type { IngredientWithRecipe } from '../packages/web/src/utils/combineIngredients.ts';

/*
 * Shopping-list aggregation cases. Most of these came out of the real recipe
 * library — recipe sites write the same ingredient a dozen ways, and every
 * variant used to land on its own row.
 *
 * packages/mobile/src/lib/combineIngredients.ts is a copy of the web module, so
 * a change here needs mirroring there.
 */

type Line = [item: string, quantity: string, unit: string];

function aggregate(lines: Line[]): string[] {
  const input = lines.map(([item, quantity, unit], i) => ({
    item,
    quantity,
    unit,
    original_text: null,
    group: null,
    _recipeTitle: `Recipe ${i}`,
    _recipeId: `recipe-${i}`,
  })) as unknown as IngredientWithRecipe[];

  return combineIngredients(input).map(
    (row) => `${row.item} → ${[row.quantity, row.unit].filter(Boolean).join(' ') || '(no amount)'}`,
  );
}

function check(name: string, lines: Line[], expected: string[]) {
  assert.deepEqual(aggregate(lines), expected, name);
}

// The bug that started this: one ingredient listed three times.
check('garlic variants merge into one row', [
  ['garlic', '', ''],
  ['garlic', '1', 'tbsp'],
  ['garlic cloves', '3', ''],
], ['garlic → 1 tbsp + 3']);

check('preparation tails are ignored', [
  ['garlic cloves, finely chopped', '5', ''],
  ['Garlic', '2', 'cloves'],
  ['fresh garlic, minced', '', ''],
], ['Garlic → 7']);

// A missing amount means "to taste" — it must never read as zero.
check('blank amount does not zero the total', [
  ['sea salt', '', ''],
  ['sea salt', '1', 'tsp'],
], ['sea salt → 1 tsp']);

check('all-blank amounts stay blank', [
  ['sea salt', '', ''],
  ['sea salt', '', ''],
], ['sea salt → (no amount)']);

// Amounts convert within a measurement family, and display at a human scale.
check('grams and kilos', [['beef mince', '500', 'g'], ['beef mince', '1', 'kg']], ['beef mince → 1.5 kg']);
check('grams promote to kilos', [['flour', '600', 'g'], ['flour', '700', 'g']], ['flour → 1.3 kg']);
check('grams stay grams', [['flour', '200', 'g'], ['flour', '150', 'g']], ['flour → 350 g']);
check('millilitres and litres', [['stock', '500', 'ml'], ['stock', '1', 'L']], ['stock → 1.5 L']);
check('teaspoons into tablespoons', [['soy sauce', '1', 'tbsp'], ['soy sauce', '3', 'tsp']], ['soy sauce → 2 tbsp']);
check('spelled-out units', [['butter', '2', 'tablespoons'], ['butter', '1', 'Tbsp']], ['butter → 3 tbsp']);
check('grams spelled out', [['sugar', '100', 'grams'], ['sugar', '50', 'g']], ['sugar → 150 g']);

// Unlike measures are shown side by side rather than invented into one figure.
check('spoons and pieces stay apart', [['ginger', '2', 'tbsp'], ['ginger', '1', 'piece']], ['ginger → 2 tbsp + 1']);
check('cans are not loose items', [
  ['chopped tomatoes', '2', 'cans'],
  ['tomatoes', '3', ''],
], ['tomatoes → 3 + 2 can']);
check('loose weight and packaging', [
  ['spinach', '200', 'g'],
  ['spinach', '1', 'bag'],
], ['spinach → 200 g + 1 bag']);

// Fractions in, fractions out.
check('fractions add up', [['butter', '1/2', 'cup'], ['butter', '1/4', 'cup']], ['butter → 3/4 cup']);
check('mixed numbers', [['flour', '1 1/2', 'cup'], ['flour', '1', 'cup']], ['flour → 2 1/2 cup']);
check('unicode fractions', [['milk', '½', 'cup'], ['milk', '½', 'cup']], ['milk → 1 cup']);
check('thirds', [['oil', '1/3', 'cup'], ['oil', '1/3', 'cup']], ['oil → 2/3 cup']);

check('unit glued to the quantity', [['pork', '750g', ''], ['pork', '250', 'g']], ['pork → 1 kg']);
check('a range buys the larger amount', [['onion', '1-2', ''], ['onion', '1', '']], ['onion → 3']);
check('unreadable amounts are skipped', [['parsley', 'a few', ''], ['parsley', '2', 'sprigs']], ['parsley → 2']);

// Name normalisation.
check('bracketed asides dropped', [
  ['carrots (or do your own)', '200', 'g'],
  ['carrot', '100', 'g'],
], ['carrot → 300 g']);
check('plural and singular', [['eggs', '2', ''], ['egg', '1', '']], ['egg → 3']);
check('irregular plural: tomatoes', [['tomatoes', '2', ''], ['tomato', '1', '']], ['tomato → 3']);
check('irregular plural: chillies', [['long red chillies', '3', ''], ['long red chilli', '1', '']], ['long red chilli → 4']);
check('counting nouns in the name', [['mint leaves', '', ''], ['fresh mint', '', '']], ['fresh mint → (no amount)']);
check('size adjectives', [['large eggs', '2', ''], ['egg', '1', '']], ['egg → 3']);
check('regional names', [['cilantro', '1', 'bunch'], ['fresh coriander', '1', 'bunch']], ['cilantro → 2 bunch']);
check('spring onion variants', [['green onions', '2', ''], ['spring onion', '1', '']], ['spring onion → 3']);
check('mince naming', [['ground beef', '500', 'g'], ['beef mince', '250', 'g']], ['beef mince → 750 g']);

// Merging the wrong things is worse than missing a merge — you buy the wrong item.
check('sugar types stay apart', [['white sugar', '1', 'cup'], ['brown sugar', '1', 'cup']], ['brown sugar → 1 cup', 'white sugar → 1 cup']);
check('dried and fresh stay apart', [['dried oregano', '1', 'tsp'], ['oregano', '1', 'tsp']], ['dried oregano → 1 tsp', 'oregano → 1 tsp']);
check('oils stay apart', [['olive oil', '2', 'tbsp'], ['sesame oil', '1', 'tbsp']], ['olive oil → 2 tbsp', 'sesame oil → 1 tbsp']);
check('coconut milk is not milk', [['milk', '1', 'cup'], ['coconut milk', '1', 'cup']], ['coconut milk → 1 cup', 'milk → 1 cup']);
check('a lone counting noun survives', [['bay leaves', '2', ''], ['lettuce leaves', '', '']], ['bay leaves → 2', 'lettuce leaves → (no amount)']);
check('canned is not fresh', [
  ['can crushed tomato', '400', 'g'],
  ['canned crushed tomatoes', '400', 'g'],
  ['tomatoes', '2', ''],
], ['can crushed tomato → 800 g', 'tomatoes → 2']);

// Scraper quirks found in the real library.
check('dual-measurement quantity', [
  ['beef mince (ground beef)', '500g / 1lb', ''],
  ['beef mince', '250', 'g'],
], ['beef mince → 750 g']);
check('imperial-first dual measurement', [
  ['canned crushed tomatoes', '14 oz / 400g', ''],
], ['canned crushed tomatoes → 14 oz']);
check('unit stranded at the head of the name', [
  ['g/ 1 lb  ground beef (mince)', '500', ''],
  ['beef mince', '500', 'g'],
], ['beef mince → 1 kg']);
check('compound unit field', [
  ['chicken thighs', '750', 'g/lb'],
  ['chicken thigh', '250', 'g'],
], ['chicken thigh → 1 kg']);
check('a size word in the unit field', [
  ['brown onions', '2', 'medium'],
  ['brown onion', '1', ''],
], ['brown onion → 3']);
check('an unrecognised unit counts as one', [
  ['black pepper', '2', 'grinds'],
  ['black pepper', '1', ''],
], ['black pepper → 3']);
check('slash alternatives', [
  ['chicken stock/broth', '2', 'cup'],
  ['chicken stock / broth', '1', 'cup'],
  ['chicken stock', '1', 'cup'],
], ['chicken stock → 4 cup']);
check('shared noun after the slash', [
  ['cooking / kosher salt', '1', 'tsp'],
  ['cooking salt', '1', 'tsp'],
  ['salt', '1', 'tsp'],
], ['salt → 3 tsp']);
check('accented spellings', [
  ['jalapeño', '2', ''],
  ['jalapeno', '1', ''],
], ['jalapeno → 3']);
check('the EACH writing device', [
  ['EACH black pepper', '1', 'tsp'],
  ['black pepper', '1', 'tsp'],
], ['black pepper → 2 tsp']);
check('celery counting nouns', [
  ['celery stalks', '2', ''],
  ['celery ribs', '2', ''],
  ['celery', '1', ''],
], ['celery → 5']);
check('bullet and measure left in the name', [
  ['- 2 tbsp lemon juice', '2', 'tbsp'],
  ['lemon juice', '1', 'tbsp'],
], ['lemon juice → 3 tbsp']);

// The row label should be the cleanest name any recipe used.
check('shortest name wins', [
  ['garlic cloves, finely chopped', '2', ''],
  ['garlic', '1', ''],
], ['garlic → 3']);
check('comma tail trimmed from the label', [
  ['cucumber, sliced into thin rounds', '1', ''],
], ['cucumber → 1']);

console.log('ingredient aggregation tests passed');

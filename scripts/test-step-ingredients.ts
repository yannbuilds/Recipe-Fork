import assert from 'node:assert/strict';
import { annotateStepIngredients, hasIngredientHighlighting, stepTextParts } from '../packages/shared/src/stepIngredients.ts';
import type { Ingredient, Step } from '../packages/shared/src/types.ts';

const ingredients = ['carrots', 'radish', 'chicken wings, split with tips removed', 'crumbled blue cheese',
  'Italian (flat-leaf) parsley', 'extra virgin olive oil', 'rice vinegar', 'black pepper', 'honey', 'hot sauce', 'salt']
  .map((item): Ingredient => ({ item, quantity: '', unit: '' }));
const plain: Step[] = [{ order: 1, category: 'Salad', instruction:
  'Toss CARROTS, carrot, radishes, parsley and blue cheese with oil, vinegar, salt and pepper.\nAdd chicken wings, wings and hot sauce; honey too. Keep saltwater and foil plain.' }];
assert.equal(hasIngredientHighlighting(plain), false);
assert.deepEqual(stepTextParts(plain[0]), [{ text: plain[0].instruction, ingredient: false }]);
const highlighted = annotateStepIngredients(plain, ingredients);
assert.equal(hasIngredientHighlighting(highlighted), true);
assert.equal(highlighted[0].instruction, plain[0].instruction);
assert.equal(highlighted[0].category, 'Salad');
const parts = stepTextParts(highlighted[0]);
assert.equal(parts.map((part) => part.text).join(''), plain[0].instruction, 'all original characters survive');
assert.deepEqual(parts.filter((part) => part.ingredient).map((part) => part.text),
  ['CARROTS', 'carrot', 'radishes', 'parsley', 'blue cheese', 'oil', 'vinegar', 'salt', 'pepper', 'chicken wings', 'wings', 'hot sauce', 'honey']);
assert.deepEqual(annotateStepIngredients(highlighted, ingredients), highlighted, 'reruns are idempotent');
assert.deepEqual(stepTextParts({ order: 1, instruction: 'oil oil, boil foil oil2 oil_ <script>', ingredient_mentions: ['oil', '', 'oil'] })
  .filter((part) => part.ingredient).map((part) => part.text), ['oil', 'oil']);
assert.equal(stepTextParts({ order: 1, instruction: 'No longer says the ingredient.', ingredient_mentions: ['carrot'] })[0].ingredient, false);
assert.deepEqual(annotateStepIngredients(plain, []), [{ ...plain[0], ingredient_mentions: [] }]);
assert.equal(hasIngredientHighlighting(annotateStepIngredients(plain, [])), true);
assert.deepEqual(stepTextParts({ order: 1, instruction: 'Use a+b (sauce).', ingredient_mentions: ['a+b (sauce)'] })
  .filter((part) => part.ingredient).map((part) => part.text), ['a+b (sauce)']);
console.log('Step ingredient highlighting: all tests passed');

import assert from 'node:assert/strict';
import {
  extractNutrition,
  extractRecipeNode,
  extractSchemaRecipe,
  mergeIngredientEnrichment,
  normaliseAiNutrition,
  normaliseAiSteps,
  parseIngredientLine,
  validateRecipeCompleteness,
} from '../supabase/functions/import-recipe/recipe-schema.ts';

const schema = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'WebSite', name: 'Example Kitchen' },
    {
      '@type': ['Recipe', 'NewsArticle'],
      name: 'Test Chicken Curry',
      description: '<p>A warming &amp; dependable curry.</p>',
      author: { '@type': 'Person', name: 'Yann Cook' },
      image: [
        { '@type': 'ImageObject', url: 'https://images.example.com/curry.jpg' },
      ],
      video: {
        '@type': 'VideoObject',
        embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
      },
      prepTime: 'PT15M',
      cookTime: 'PT1H5M',
      recipeYield: '4-6 servings',
      recipeCuisine: 'Indian',
      recipeCategory: 'Dinner',
      keywords: 'chicken, gluten-free',
      recipeIngredient: [
        '2½ cups chicken stock',
        '100 g / 1 stick unsalted butter, melted',
        'Salt to taste',
      ],
      recipeInstructions: [
        {
          '@type': 'HowToSection',
          name: 'Curry base',
          itemListElement: [
            { '@type': 'HowToStep', text: '<b>Fry</b> the onions.' },
            { '@type': 'HowToStep', text: 'Add spices &amp; stir.' },
          ],
        },
        { '@type': 'HowToStep', text: 'Simmer for 20 minutes.' },
      ],
    },
  ],
};

const html = `<!doctype html>
<html>
  <head>
    <script type="application/ld+json">${JSON.stringify({ '@type': 'BreadcrumbList' })}</script>
    <script data-id="recipe" type="application/ld+json">${JSON.stringify(schema)}</script>
  </head>
  <body><iframe src="https://www.youtube.com/embed/aaaaaaaaaaa"></iframe></body>
</html>`;

const node = extractRecipeNode(html);
assert.equal(node?.name, 'Test Chicken Curry', 'finds Recipe nested inside @graph and a later script');

const recipe = extractSchemaRecipe(html, 'https://example.com/curry');
assert.ok(recipe, 'extracts a recipe');
assert.equal(recipe.title, 'Test Chicken Curry');
assert.equal(recipe.description, 'A warming & dependable curry.');
assert.equal(recipe.creator_name, 'Yann Cook');
assert.equal(recipe.image_url, 'https://images.example.com/curry.jpg');
assert.equal(recipe.video_url, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
assert.equal(recipe.prep_time, 15);
assert.equal(recipe.cook_time, 65);
assert.equal(recipe.servings, 4);
assert.deepEqual(recipe.tags, [
  { name: 'indian', emoji: '🇮🇳' },
  { name: 'dinner', emoji: '🍽️' },
  { name: 'chicken', emoji: '🍗' },
  { name: 'gluten-free', emoji: '🌾' },
]);

assert.equal(recipe.ingredients.length, 3, 'preserves every ingredient');
assert.deepEqual(recipe.ingredients[0], {
  original_text: '2½ cups chicken stock',
  quantity: '2 1/2',
  unit: 'cups',
  item: 'chicken stock',
  category: '',
});
assert.deepEqual(recipe.ingredients[1], {
  original_text: '100 g / 1 stick unsalted butter, melted',
  quantity: '100',
  unit: 'g',
  item: 'unsalted butter, melted',
  category: '',
});
assert.deepEqual(recipe.ingredients[2], {
  original_text: 'Salt to taste',
  quantity: '',
  unit: '',
  item: 'Salt to taste',
  category: '',
});

assert.deepEqual(recipe.steps, [
  { order: 1, instruction: 'Fry the onions.', category: 'Curry base' },
  { order: 2, instruction: 'Add spices & stir.', category: 'Curry base' },
  { order: 3, instruction: 'Simmer for 20 minutes.', category: '' },
]);
assert.deepEqual(validateRecipeCompleteness(recipe), []);

// WPRM sites (e.g. RecipeTin Eats) list recipeIngredient FLAT in JSON-LD;
// the group headings live only in the page HTML. The extractor must lift
// them from the wprm-recipe-ingredient-group markup.
const wprmSchema = {
  '@type': 'Recipe',
  name: 'Test Pho',
  recipeIngredient: [
    '2  large onions (, halved)',
    '10  star anise',
    '1.5 kg / 3 lb  brisket',
  ],
  recipeInstructions: [{ '@type': 'HowToStep', text: 'Simmer everything.' }],
};
const wprmHtml = `<!doctype html>
<html><head>
<script type="application/ld+json">${JSON.stringify(wprmSchema)}</script>
</head><body>
<div class="wprm-recipe-ingredient-group"><h4 class="wprm-recipe-group-name wprm-recipe-ingredient-group-name">Aromatics:</h4><ul class="wprm-recipe-ingredients"><li class="wprm-recipe-ingredient"><span class="wprm-checkbox-container"><input type="checkbox" aria-label="x"><label><span class="sr-only">&#9634; </span></label></span><span class="wprm-recipe-ingredient-amount">2</span> <span class="wprm-recipe-ingredient-name">large onions</span> <span class="wprm-recipe-ingredient-notes">, halved</span></li></ul></div>
<div class="wprm-recipe-ingredient-group"><h4 class="wprm-recipe-group-name wprm-recipe-ingredient-group-name">Spices</h4><ul class="wprm-recipe-ingredients"><li class="wprm-recipe-ingredient"><span class="wprm-recipe-ingredient-amount">10</span> <span class="wprm-recipe-ingredient-name">star anise</span></li></ul></div>
<div class="wprm-recipe-ingredient-group"><h4 class="wprm-recipe-group-name wprm-recipe-ingredient-group-name">Beef:</h4><ul class="wprm-recipe-ingredients"><li class="wprm-recipe-ingredient"><span class="wprm-recipe-ingredient-amount">1.5</span> <span class="wprm-recipe-ingredient-unit">kg</span> <span class="wprm-recipe-ingredient-name">brisket</span></li></ul></div>
</body></html>`;
const wprmRecipe = extractSchemaRecipe(wprmHtml, 'https://example.com/pho');
assert.ok(wprmRecipe, 'extracts the WPRM recipe');
assert.deepEqual(
  wprmRecipe.ingredients.map((i) => i.category),
  ['Aromatics', 'Spices', 'Beef'],
  'lifts ingredient group headings from WPRM HTML onto flat JSON-LD ingredients',
);
assert.equal(
  wprmRecipe.ingredients[0].original_text,
  '2 large onions (, halved)',
  'original_text still comes from JSON-LD, not the HTML groups',
);

// Marion's Kitchen embeds group headings as colonless pseudo-ingredient lines
// after "&nbsp;" separators in its flat recipeIngredient list. They must be
// lifted into categories, not saved as ingredients.
const inlineHeadingSchema = {
  '@type': 'Recipe',
  name: 'Char Siu Pork Noodle Salad Bowl',
  recipeIngredient: [
    '2 cups bean shoots',
    'chilli oil, to serve (optional)',
    '&nbsp;',
    'Quick pickled vegetables',
    '200g (7 oz) pre-cut shredded or julienned carrots (or do your own)',
    '1 cucumber, sliced into thin rounds',
    '&nbsp;',
    'Nuoc cham dressing',
    '½ cup fish sauce',
    '3 tbsp white vinegar',
  ],
  recipeInstructions: [{ '@type': 'HowToStep', text: 'Toss it all together.' }],
};
const inlineHeadingHtml = `<html><head><script type="application/ld+json">${
  JSON.stringify(inlineHeadingSchema)
}</script></head><body></body></html>`;
const inlineHeadingRecipe = extractSchemaRecipe(
  inlineHeadingHtml,
  'https://www.marionskitchen.com/char-siu-pork-noodle-salad-bowl/',
);
assert.ok(inlineHeadingRecipe, 'extracts the inline-heading recipe');
assert.deepEqual(
  inlineHeadingRecipe.ingredients.map((i) => [i.original_text, i.category]),
  [
    ['2 cups bean shoots', ''],
    ['chilli oil, to serve (optional)', ''],
    [
      '200g (7 oz) pre-cut shredded or julienned carrots (or do your own)',
      'Quick pickled vegetables',
    ],
    ['1 cucumber, sliced into thin rounds', 'Quick pickled vegetables'],
    ['½ cup fish sauce', 'Nuoc cham dressing'],
    ['3 tbsp white vinegar', 'Nuoc cham dressing'],
  ],
  'Marion headings become categories and blank lines are dropped',
);

// Colon-suffixed pseudo-ingredient headings remain supported generically.
const colonHeadingSchema = {
  '@type': 'Recipe',
  name: 'Test Sesame Noodles',
  recipeIngredient: ['2 cups bean shoots', 'Dressing:', '2 tbsp sesame oil'],
  recipeInstructions: [{ '@type': 'HowToStep', text: 'Toss it all together.' }],
};
const colonHeadingHtml = `<html><head><script type="application/ld+json">${
  JSON.stringify(colonHeadingSchema)
}</script></head><body></body></html>`;
const colonHeadingRecipe = extractSchemaRecipe(colonHeadingHtml, 'https://example.com/noodles');
assert.ok(colonHeadingRecipe, 'extracts the colon-heading recipe');
assert.deepEqual(
  colonHeadingRecipe.ingredients.map((i) => [i.original_text, i.category]),
  [
    ['2 cups bean shoots', ''],
    ['2 tbsp sesame oil', 'Dressing'],
  ],
  'colon-suffixed headings still become categories for other sites',
);

// A deterministic page-derived category must survive AI enrichment.
const wprmEnriched = mergeIngredientEnrichment(wprmRecipe.ingredients, [
  {
    original_text: '2 large onions (, halved)',
    item: 'large onions, halved',
    quantity: '2',
    unit: '',
    category: 'Wrong AI Guess',
  },
]);
assert.equal(
  wprmEnriched[0].category,
  'Aromatics',
  'schema/page category beats the AI category',
);
assert.equal(wprmEnriched[0].item, 'large onions, halved', 'AI still enriches item');

const enriched = mergeIngredientEnrichment(recipe.ingredients, [
  {
    original_text: '2½ cups chicken stock',
    item: 'chicken stock',
    quantity: '2 1/2',
    unit: 'cup',
    category: 'Sauce',
  },
  // This deliberately omits the other two lines. The merge must preserve them.
]);
assert.equal(enriched.length, 3, 'AI enrichment cannot change ingredient count');
assert.equal(enriched[0].category, 'Sauce');
assert.equal(enriched[1].original_text, '100 g / 1 stick unsalted butter, melted');
assert.equal(enriched[2].item, 'Salt to taste');

assert.deepEqual(normaliseAiSteps([
  { order: 8, instruction: ' First step. ' },
  { instruction: '' },
  { instruction: 'Second step.', category: 'Finish' },
]), [
  { order: 1, instruction: 'First step.', category: '' },
  { order: 2, instruction: 'Second step.', category: 'Finish' },
]);

assert.deepEqual(validateRecipeCompleteness({ title: 'Broken', ingredients: [], steps: [] }), [
  'ingredients are missing',
  'directions are missing',
]);

assert.deepEqual(parseIngredientLine('400g canned tomatoes'), {
  original_text: '400g canned tomatoes',
  quantity: '400',
  unit: 'g',
  item: 'canned tomatoes',
  category: '',
});

// ── Nutrition ────────────────────────────────────────────────────
// The recipe above publishes none, so the field stays null rather than
// inventing numbers from the ingredients.
assert.equal(recipe.nutrition, null, 'no nutrition published means no nutrition stored');

// RecipeTin Eats shape: full macro set, "586 kcal" / "9 g" / "125 mg".
assert.deepEqual(
  extractNutrition({
    '@type': 'NutritionInformation',
    servingSize: '243 g',
    calories: '586 kcal',
    carbohydrateContent: '9 g',
    proteinContent: '37 g',
    fatContent: '44 g',
    saturatedFatContent: '24 g',
    cholesterolContent: '125 mg',
    sodiumContent: '449 mg',
    fiberContent: '1 g',
    sugarContent: '3 g',
  }),
  {
    calories: 586,
    protein: 37,
    carbohydrate: 9,
    fat: 44,
    saturated_fat: 24,
    trans_fat: null,
    unsaturated_fat: null,
    fibre: 1,
    sugar: 3,
    sodium: 449,
    cholesterol: 125,
    serving_size: '243 g',
  },
  'reads the full RecipeTin macro set',
);

// BBC Good Food spells its units out ("52 grams fat", "844 calories").
const bbc = extractNutrition({
  calories: '844 calories',
  fatContent: '52 grams fat',
  saturatedFatContent: '30 grams saturated fat',
  carbohydrateContent: '54 grams carbohydrates',
  proteinContent: '37 grams protein',
});
assert.equal(bbc?.calories, 844, 'reads spelled-out calorie units');
assert.equal(bbc?.fat, 52, 'reads spelled-out gram units');
assert.equal(bbc?.protein, 37);

// Units are converted to canonical ones: mg for sodium, g for macros, kcal
// for energy. Values themselves are copied faithfully — never "corrected".
assert.equal(extractNutrition({ sodiumContent: '1.2 g' })?.sodium, 1200, 'grams of sodium → mg');
assert.equal(extractNutrition({ sodiumContent: '449' })?.sodium, 449, 'bare sodium is already mg');
assert.equal(extractNutrition({ fatContent: '500 mg' })?.fat, 0.5, 'mg of fat → grams');
assert.equal(extractNutrition({ calories: '2500 kJ' })?.calories, 597.51, 'kJ → kcal');
assert.equal(extractNutrition({ calories: 530 })?.calories, 530, 'plain numbers pass through');

// A serving size with no numbers behind it isn't worth a panel.
assert.equal(
  extractNutrition({ servingSize: '1 serving' }),
  null,
  'serving size alone is not nutrition',
);
assert.equal(extractNutrition(undefined), null);
assert.equal(extractNutrition('530 kcal'), null, 'a bare string is not NutritionInformation');

// Calories-only pages (common on RecipeTin) still produce a panel.
const caloriesOnly = extractNutrition({ calories: '530 kcal', servingSize: '1 serving' });
assert.equal(caloriesOnly?.calories, 530);
assert.equal(caloriesOnly?.protein, null, 'unpublished fields stay null');

// The AI path accepts our own field names and normalises identically.
assert.deepEqual(
  normaliseAiNutrition({ calories: '530 kcal', protein: '31 g', carbs: '12 g', sodium: '1.1 g' }),
  {
    calories: 530,
    protein: 31,
    carbohydrate: 12,
    fat: null,
    saturated_fat: null,
    trans_fat: null,
    unsaturated_fat: null,
    fibre: null,
    sugar: null,
    sodium: 1100,
    cholesterol: null,
    serving_size: null,
  },
  'AI nutrition is normalised the same way as schema nutrition',
);
assert.equal(normaliseAiNutrition(null), null, 'no AI nutrition means null');

// A recipe whose schema carries nutrition surfaces it on the extraction.
const nutritionHtml = `<html><head><script type="application/ld+json">${
  JSON.stringify({
    '@type': 'Recipe',
    name: 'Test Stroganoff',
    recipeIngredient: ['500g beef'],
    recipeInstructions: [{ '@type': 'HowToStep', text: 'Cook it.' }],
    nutrition: { '@type': 'NutritionInformation', calories: '586 kcal', proteinContent: '37 g' },
  })
}</script></head><body></body></html>`;
const nutritionRecipe = extractSchemaRecipe(nutritionHtml, 'https://example.com/stroganoff');
assert.equal(nutritionRecipe?.nutrition?.calories, 586, 'nutrition rides along on the schema recipe');
assert.equal(nutritionRecipe?.nutrition?.protein, 37);

console.log('recipe-schema tests passed');

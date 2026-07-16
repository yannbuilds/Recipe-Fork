import assert from 'node:assert/strict';
import {
  extractRecipeNode,
  extractSchemaRecipe,
  mergeIngredientEnrichment,
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

console.log('recipe-schema tests passed');

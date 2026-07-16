import assert from 'node:assert/strict';

const endpoint = process.env.RECIPE_IMPORT_URL ??
  'https://likpszciqjruoqxwloot.supabase.co/functions/v1/import-recipe';
const url = 'https://example.com/recipe-fork-smoke-test';
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Recipe',
  name: 'Recipe Fork Smoke Test',
  author: { '@type': 'Person', name: 'Recipe Fork' },
  prepTime: 'PT5M',
  cookTime: 'PT10M',
  recipeYield: '2 servings',
  recipeIngredient: ['1 cup plain flour', '½ tsp salt'],
  recipeInstructions: [
    { '@type': 'HowToStep', text: 'Mix the flour and salt.' },
    { '@type': 'HowToStep', text: 'Cook for 10 minutes.' },
  ],
};
const html = `<html><head><script type="application/ld+json">${JSON.stringify(jsonLd)}</script></head><body></body></html>`;

async function invokeImport(testUrl: string, testHtml: string) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: testUrl, html: testHtml }),
    signal: AbortSignal.timeout(45_000),
  });
  return { response, body: await response.json() as any };
}

async function main() {
  const { response, body } = await invokeImport(url, html);

  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(body.recipe?.title, 'Recipe Fork Smoke Test');
  assert.deepEqual(
    body.recipe?.ingredients?.map((ingredient: any) => ingredient.original_text),
    ['1 cup plain flour', '½ tsp salt'],
    'production must preserve every authoritative ingredient line',
  );
  assert.deepEqual(
    body.recipe?.steps?.map((step: any) => step.instruction),
    ['Mix the flour and salt.', 'Cook for 10 minutes.'],
    'production must preserve every authoritative direction',
  );
  assert.equal(body.extraction?.method, 'json-ld');
  assert.equal(body.extraction?.ingredient_count, 2);
  assert.equal(body.extraction?.step_count, 2);

  console.log({
    status: response.status,
    method: body.extraction.method,
    aiEnrichment: body.extraction.ai_enrichment,
    ingredients: body.extraction.ingredient_count,
    steps: body.extraction.step_count,
  });

  const fallbackHtml = `<html><body>
    <h1>Simple Tomato Pasta</h1>
    <p>A quick weeknight pasta recipe with a fresh tomato sauce. Serves 4. Preparation time 10 minutes. Cooking time 20 minutes.</p>
    <h2>Ingredients</h2>
    <ul>
      <li>400 g spaghetti</li>
      <li>2 tbsp olive oil</li>
      <li>3 cups chopped tomatoes</li>
    </ul>
    <h2>Directions</h2>
    <ol>
      <li>Bring a large pot of salted water to the boil.</li>
      <li>Cook the spaghetti until al dente.</li>
      <li>Simmer the tomatoes in olive oil, then toss with the drained pasta and serve.</li>
    </ol>
  </body></html>`;
  const fallback = await invokeImport('https://example.com/recipe-fork-fallback-smoke-test', fallbackHtml);
  assert.equal(fallback.response.status, 200, JSON.stringify(fallback.body));
  assert.equal(fallback.body.extraction?.method, 'ai-fallback');
  assert.equal(fallback.body.recipe?.ingredients?.length, 3);
  assert.equal(fallback.body.recipe?.steps?.length, 3);
  console.log({
    status: fallback.response.status,
    method: fallback.body.extraction.method,
    ingredients: fallback.body.extraction.ingredient_count,
    steps: fallback.body.extraction.step_count,
  });

  console.log('production recipe import smoke tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

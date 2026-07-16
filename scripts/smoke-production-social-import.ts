import assert from 'node:assert/strict';

const endpoint = process.env.RECIPE_IMPORT_URL ??
  'https://likpszciqjruoqxwloot.supabase.co/functions/v1/import-recipe';
const sharedUrl = 'https://www.youtube.com/watch?v=yb7TE99Kh8I';

async function main() {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: sharedUrl }),
    signal: AbortSignal.timeout(60_000),
  });
  const body = await response.json() as any;

  assert.equal(response.status, 200, JSON.stringify(body));
  assert.ok(
    ['social-caption', 'social-linked-recipe'].includes(body.extraction?.method),
    `unexpected extraction method: ${body.extraction?.method}`,
  );
  assert.equal(body.recipe?.source_url, sharedUrl);
  assert.equal(body.recipe?.video_url, sharedUrl);
  assert.match(body.recipe?.title ?? '', /Chicken Chasseur/i);
  assert.ok(body.recipe?.ingredients?.length >= 10, 'expected a complete ingredient list');
  assert.ok(body.recipe?.steps?.length >= 4, 'expected a complete method');

  console.log({
    status: response.status,
    method: body.extraction.method,
    title: body.recipe.title,
    ingredients: body.extraction.ingredient_count,
    steps: body.extraction.step_count,
  });
  console.log('production social import smoke test passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

import assert from 'node:assert/strict';
import {
  extractRecipeNode,
  extractSchemaRecipe,
} from '../supabase/functions/import-recipe/recipe-schema.ts';

const endpoint = process.env.RECIPE_IMPORT_URL ??
  'https://likpszciqjruoqxwloot.supabase.co/functions/v1/import-recipe';

const urls = [
  'https://www.recipetineats.com/chicken-chasseur',
  'https://www.recipetineats.com/pineapple-fried-rice-thai',
  'https://www.recipetineats.com/bok-choy-in-ginger-sauce',
  'https://www.thedeliciouscrescent.com/haleem-recipe',
  'https://diethood.com/pan-fried-chicken-breasts',
  'https://www.themediterraneandish.com/mediterranean-chickpea-egg-salad-recipe',
  'https://japan.recipetineats.com/japanese-fried-chicken-karaage-chicken',
  'https://www.gimmesomeoven.com/homemade-corn-tortillas',
];

async function fetchHtml(url: string): Promise<string> {
  const direct = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-AU,en;q=0.9',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(25_000),
  }).catch(() => null);
  if (direct?.ok) return direct.text();

  const reader = await fetch(`https://r.jina.ai/${url}`, {
    headers: { 'X-Return-Format': 'html', 'X-Timeout': '30' },
    redirect: 'follow',
    signal: AbortSignal.timeout(35_000),
  });
  if (!reader.ok) {
    throw new Error(`direct HTTP ${direct?.status ?? 'error'}, reader HTTP ${reader.status}`);
  }
  return reader.text();
}

async function checkProduction(url: string) {
  const sourceHtml = await fetchHtml(url);
  const sourceNode = extractRecipeNode(sourceHtml);
  assert.ok(sourceNode, `${url}: no Recipe JSON-LD`);

  // Keep the real recipe schema but remove its image before invoking production.
  // This exercises the deployed parser and Groq merge without creating orphaned
  // test images in Supabase Storage.
  const safeNode = structuredClone(sourceNode);
  delete safeNode.image;
  const safeHtml = `<html><head><script type="application/ld+json">${JSON.stringify(safeNode)}</script></head></html>`;
  const expected = extractSchemaRecipe(safeHtml, url);
  assert.ok(expected, `${url}: could not build expected recipe`);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, html: safeHtml }),
    signal: AbortSignal.timeout(60_000),
  });
  const body = await response.json() as any;
  assert.equal(response.status, 200, `${url}: ${JSON.stringify(body)}`);
  assert.equal(body.extraction?.method, 'json-ld', `${url}: wrong extraction method`);
  assert.equal(body.recipe?.title, expected.title, `${url}: title changed`);
  assert.deepEqual(
    body.recipe?.ingredients?.map((ingredient: any) => ingredient.original_text),
    expected.ingredients.map((ingredient) => ingredient.original_text),
    `${url}: ingredient lines changed`,
  );
  assert.deepEqual(
    body.recipe?.steps?.map((step: any) => step.instruction),
    expected.steps.map((step) => step.instruction),
    `${url}: directions changed`,
  );
  assert.equal(body.recipe?.video_url, expected.video_url, `${url}: video changed`);
  assert.equal(body.recipe?.servings, expected.servings, `${url}: servings changed`);
  assert.equal(body.recipe?.prep_time, expected.prep_time, `${url}: prep time changed`);
  assert.equal(body.recipe?.cook_time, expected.cook_time, `${url}: cook time changed`);

  return {
    site: new URL(url).hostname,
    title: expected.title.slice(0, 34),
    ingredients: expected.ingredients.length,
    steps: expected.steps.length,
    video: expected.video_url ? 'yes' : 'no',
    ai: body.extraction.ai_enrichment ? 'yes' : 'fallback',
  };
}

async function main() {
  const results = await Promise.all(urls.map(checkProduction));
  console.table(results);
  console.log(`${results.length}/${results.length} production recipe soak checks passed`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

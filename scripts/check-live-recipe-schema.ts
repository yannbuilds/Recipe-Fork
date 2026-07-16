import fs from 'node:fs/promises';
import { extractSchemaRecipe, validateRecipeCompleteness } from '../supabase/functions/import-recipe/recipe-schema.ts';

const urls = [
  'https://www.recipetineats.com/chicken-chasseur',
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

function normaliseUrl(value: string): string {
  return value.toLowerCase().replace(/\/$/, '');
}

async function checkUrl(
  url: string,
  existingByUrl: Map<string, { ingredients?: unknown[]; steps?: unknown[] }>,
) {
  try {
    const html = await fetchHtml(url);
    const recipe = extractSchemaRecipe(html, url);
    if (!recipe) throw new Error('no Recipe JSON-LD');
    const errors = validateRecipeCompleteness(recipe);
    const previous = existingByUrl.get(normaliseUrl(url));
    return {
      host: new URL(url).hostname,
      title: recipe.title,
      ingredients: recipe.ingredients.length,
      previousIngredients: previous?.ingredients?.length ?? null,
      steps: recipe.steps.length,
      previousSteps: previous?.steps?.length ?? null,
      video: Boolean(recipe.video_url),
      complete: errors.length === 0,
      error: errors.join(', '),
    };
  } catch (error) {
    return {
      host: new URL(url).hostname,
      title: '',
      ingredients: 0,
      previousIngredients: null,
      steps: 0,
      previousSteps: null,
      video: false,
      complete: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  const existing = JSON.parse(await fs.readFile('scripts/import-recipes.data.json', 'utf8')) as Array<{
    source_url?: string;
    ingredients?: unknown[];
    steps?: unknown[];
  }>;
  const existingByUrl = new Map(
    existing
      .filter((recipe) => recipe.source_url)
      .map((recipe) => [normaliseUrl(recipe.source_url!), recipe]),
  );
  const results = await Promise.all(urls.map((url) => checkUrl(url, existingByUrl)));

  console.table(results.map((result) => ({
    site: result.host,
    title: result.title.slice(0, 35),
    ingredients: `${result.ingredients}${result.previousIngredients === null ? '' : ` (was ${result.previousIngredients})`}`,
    steps: `${result.steps}${result.previousSteps === null ? '' : ` (was ${result.previousSteps})`}`,
    video: result.video ? 'yes' : 'no',
    complete: result.complete ? 'yes' : 'NO',
    error: result.error,
  })));

  const failures = results.filter((result) => !result.complete);
  if (failures.length > 0) {
    throw new Error(`${failures.length}/${results.length} live recipe checks failed`);
  }

  console.log(`${results.length}/${results.length} live recipe schema checks passed`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

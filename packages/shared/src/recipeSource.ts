const TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'gbraid',
  'wbraid',
  'msclkid',
  'mc_cid',
  'mc_eid',
  'ref',
  'ref_src',
  'ref_url',
  '_ga',
  '_gl',
]);

/**
 * Keep a useful source URL while removing decorations that do not identify a
 * different recipe. This is shared by every import surface so they all make
 * the same duplicate decision.
 */
export function normalizeRecipeSourceUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  try {
    const url = new URL(trimmed);
    url.hash = '';

    for (const key of Array.from(url.searchParams.keys())) {
      const lowerKey = key.toLowerCase();
      if (lowerKey.startsWith('utm_') || TRACKING_PARAMS.has(lowerKey)) {
        url.searchParams.delete(key);
      }
    }
    url.searchParams.sort();

    if (url.pathname.length > 1) {
      url.pathname = url.pathname.replace(/\/+$/, '');
    }

    return url.toString();
  } catch {
    return trimmed;
  }
}

/** A comparison-only key: http/https and www are the same recipe source. */
export function recipeSourceKey(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;

  const normalized = normalizeRecipeSourceUrl(raw);
  try {
    const url = new URL(normalized);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const port = url.port ? `:${url.port}` : '';
    return `${host}${port}${url.pathname}${url.search}`;
  } catch {
    return normalized.toLowerCase();
  }
}

interface SourceRecord {
  id: string;
  source_url?: string | null;
  user_id?: string;
}

export function findRecipeWithSameSource<T extends SourceRecord>(
  recipes: readonly T[],
  sourceUrl: string,
): T | undefined {
  const key = recipeSourceKey(sourceUrl);
  if (!key) return undefined;
  return recipes.find((recipe) => recipeSourceKey(recipe.source_url) === key);
}

/**
 * Collapse imported copies of the same source while leaving manual and photo
 * recipes (which have no source URL) untouched. When a family collection has
 * two copies, prefer the current user's record without otherwise reordering.
 */
export function dedupeRecipesBySource<T extends SourceRecord>(
  recipes: readonly T[],
  preferredUserId?: string,
): T[] {
  const chosen = new Map<string, T>();

  for (const recipe of recipes) {
    const key = recipeSourceKey(recipe.source_url);
    if (!key) continue;

    const existing = chosen.get(key);
    if (!existing || (recipe.user_id === preferredUserId && existing.user_id !== preferredUserId)) {
      chosen.set(key, recipe);
    }
  }

  return recipes.filter((recipe) => {
    const key = recipeSourceKey(recipe.source_url);
    return !key || chosen.get(key)?.id === recipe.id;
  });
}

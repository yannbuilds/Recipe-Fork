import { scaleIngredientsForServings } from './scaling.js';
import type { Ingredient, MealPlanEntry, Recipe } from './types.js';

/*
 * Sub-recipes.
 *
 * An ingredient line can point at another recipe — the pastry in a pie, the
 * pesto in a pasta — via `Ingredient.recipe_id`. This module is the single
 * source of truth for what that link means, so web and mobile can't drift.
 *
 * Two rules run through everything here:
 *  - One level only. A linked recipe's own links are never followed, which
 *    also means a cycle (A uses B uses A) can't loop.
 *  - Links are advisory. There is no foreign key behind `recipe_id` — the
 *    ingredients live in a jsonb array — so an id can point at a recipe that
 *    was deleted or that belongs to someone outside your family group. Every
 *    lookup falls back to the plain ingredient line rather than erroring.
 */

/** Everything the app needs about a linked recipe. Deliberately narrower than
 *  `Recipe` so callers can fetch just these columns. */
export type SubRecipe = Pick<
  Recipe,
  'id' | 'title' | 'image_url' | 'servings' | 'custom_servings' | 'ingredients'
>;

/** Linked recipes keyed by id. A plain object, not a Map, so it survives the
 *  JSON round-trip through mobile's persisted TanStack Query cache. */
export type SubRecipeMap = Record<string, SubRecipe>;

/** Columns to select when fetching linked recipes. Written out rather than
 *  reusing either platform's RECIPE_SELECT, which omits `custom_servings` and
 *  would quietly scale sub-recipes off the wrong batch size. */
export const SUB_RECIPE_SELECT = 'id, title, image_url, servings, custom_servings, ingredients';

/** An ingredient tagged with where it came from, ready for `combineIngredients`.
 *  Structurally identical to each platform's `IngredientWithRecipe`. */
export interface TaggedIngredient extends Ingredient {
  _recipeTitle: string;
  _recipeId: string;
}

/** Every recipe id linked from these ingredients, deduped. */
export function subRecipeIdsIn(ingredients: Ingredient[] | null | undefined): string[] {
  const ids = new Set<string>();
  for (const ing of ingredients ?? []) {
    if (ing?.recipe_id) ids.add(ing.recipe_id);
  }
  return [...ids];
}

/**
 * Does this recipe link to anything? The cheap gate for "should we ask about
 * sub-recipes here?" — it runs without a fetch, so an add-to-plan flow can skip
 * the question entirely for the overwhelming majority of recipes. Whether the
 * links actually *resolve* is only knowable after fetching; the prompt handles
 * that case by answering itself.
 */
export function hasSubRecipes(
  recipe: { ingredients?: Ingredient[] | null } | null | undefined,
): boolean {
  return subRecipeIdsIn(recipe?.ingredients).length > 0;
}

/**
 * The recipe behind an ingredient line, or null when there isn't a usable one:
 * no link, a link to itself, or a link we can't read. An empty recipe still
 * resolves — it's linkable and openable, it just can't be expanded onto a
 * shopping list (see `expandIngredientsForEntry`).
 */
export function resolveSubRecipe(
  ingredient: Ingredient | null | undefined,
  byId: SubRecipeMap | null | undefined,
  selfId?: string | null,
): SubRecipe | null {
  const id = ingredient?.recipe_id;
  if (!id || !byId) return null;
  if (selfId && id === selfId) return null;
  return byId[id] ?? null;
}

/**
 * Are we cooking this entry's sub-recipes or buying them?
 *
 * `null` means nobody was ever asked: a plan row written before this feature
 * existed, one added by an older app build, or the bulk "plan the week" flow
 * which deliberately doesn't interrupt. All of those should behave as "you're
 * cooking it" — that's the reason you linked the recipe in the first place.
 */
export function makesComponents(
  entry: { make_components?: boolean | null } | null | undefined,
): boolean {
  return entry?.make_components ?? true;
}

/** What a recipe makes on its own terms. Mirrors `recipeBatch` in each
 *  platform's mealPlanDays helper, kept here so this module stays standalone. */
function batchOf(recipe: Pick<SubRecipe, 'servings' | 'custom_servings'>): number {
  return recipe.custom_servings ?? recipe.servings ?? 0;
}

/**
 * The ingredients one planned cook puts on the shopping list, with linked
 * sub-recipes resolved.
 *
 * When the cook is making a sub-recipe, its line ("500g shortcrust pastry") is
 * *replaced* by that recipe's own ingredients — you shop for flour and butter,
 * not for pastry. When they're buying it, the line stays exactly as written.
 * Either way the thing gets bought once.
 *
 * `targetServings` is what this cook is being shopped for — pass the platform's
 * `entryServings(entry)`. Children scale by the same ratio the parent does, off
 * the parent's own `servings`, so a double batch of pie needs double the pastry.
 */
export function expandIngredientsForEntry(
  entry: Pick<MealPlanEntry, 'recipe' | 'make_components'>,
  targetServings: number | null | undefined,
  byId: SubRecipeMap | null | undefined,
): TaggedIngredient[] {
  const parent = entry.recipe;
  if (!parent) return [];

  const parentTitle = parent.title || 'Unknown';
  const scaled = scaleIngredientsForServings(
    parent.ingredients ?? [],
    parent.servings,
    targetServings,
  );

  // How far this cook has been scaled from what the recipe says it makes.
  // Deliberately off `parent.servings` — the same denominator the parent's own
  // lines used above, so a child can't drift when `custom_servings` is set.
  const ratio =
    parent.servings && targetServings ? targetServings / parent.servings : 1;

  const out: TaggedIngredient[] = [];

  for (const ing of scaled) {
    const child = makesComponents(entry)
      ? resolveSubRecipe(ing, byId, parent.id)
      : null;

    // A child with nothing in it can't stand in for the parent's line — swapping
    // would make the ingredient vanish from the list altogether.
    if (!child || child.ingredients.length === 0) {
      out.push({ ...ing, _recipeTitle: parentTitle, _recipeId: parent.id });
      continue;
    }

    const childBatch = batchOf(child);
    const childIngredients = scaleIngredientsForServings(
      child.ingredients,
      childBatch,
      childBatch * ratio,
    );

    for (const sub of childIngredients) {
      out.push({
        ...sub,
        // Never let a grandchild link ride along — expansion is one level.
        recipe_id: null,
        _recipeTitle: `${child.title} (for ${parentTitle})`,
        // The child's id, so tapping the source opens the recipe you'd cook.
        _recipeId: child.id,
      });
    }
  }

  return out;
}

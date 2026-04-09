import type { AggregatedIngredient } from './combineIngredients';
import { classifyIngredient } from './ingredientCategoryMap';

const CATEGORY_ORDER = [
  'Produce',
  'Meat & Seafood',
  'Dairy & Eggs',
  'Bakery',
  'Pantry & Dry Goods',
  'Canned & Jarred',
  'Frozen',
  'Condiments & Sauces',
  'Spices & Seasonings',
  'Drinks',
  'Other',
];

export { CATEGORY_ORDER };

/**
 * Categorise ingredients into shopping aisle categories using a local keyword map.
 * Returns a merged category map (ingredient name → category).
 */
export async function categoriseIngredients(
  ingredients: AggregatedIngredient[],
  existingCategories: Record<string, string>,
): Promise<Record<string, string>> {
  const merged = { ...existingCategories };

  for (const ing of ingredients) {
    const key = ing.item.toLowerCase().trim();
    if (!key) continue;
    // Re-classify items previously stuck as "Other" from the old LLM-based flow
    if (merged[key] && merged[key] !== 'Other') continue;
    merged[key] = classifyIngredient(ing.item);
  }

  return merged;
}

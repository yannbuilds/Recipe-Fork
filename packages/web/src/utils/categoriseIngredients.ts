import { supabase } from '@recipe-aggregator/shared';
import type { AggregatedIngredient } from './combineIngredients';

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
 * Categorise ingredients into shopping aisle categories via edge function.
 * Only sends uncategorised items. Returns a merged category map.
 */
export async function categoriseIngredients(
  ingredients: AggregatedIngredient[],
  existingCategories: Record<string, string>,
): Promise<Record<string, string>> {
  // Find items that aren't already categorised
  const uncategorised = ingredients.filter(
    (ing) => !existingCategories[ing.item.toLowerCase().trim()]
  );

  // If everything is already categorised, return existing map
  if (uncategorised.length === 0) return existingCategories;

  const itemNames = uncategorised.map((ing) => ing.item);

  try {
    const { data, error } = await supabase.functions.invoke('categorise-ingredients', {
      body: { ingredients: itemNames, existingCategories },
    });

    if (error) {
      console.warn('Edge function error – skipping categorisation:', error);
      return existingCategories;
    }

    return data?.categories ?? existingCategories;
  } catch (err) {
    console.warn('Failed to categorise ingredients:', err);
    return existingCategories;
  }
}

import type { AggregatedIngredient } from './combineIngredients';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

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
 * Categorise ingredients into shopping aisle categories using Groq Llama.
 * Only sends uncategorised items to the LLM. Returns a merged category map.
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

  const apiKey = import.meta.env.VITE_GROQ_API_KEY;
  if (!apiKey) {
    console.warn('Groq API key not configured – skipping ingredient categorisation');
    return existingCategories;
  }

  const itemNames = uncategorised.map((ing) => ing.item).join(', ');

  try {
    const res = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          {
            role: 'system',
            content: `You categorise grocery ingredients into shopping aisle categories.
Return ONLY a JSON object mapping each ingredient name (lowercase) to exactly one of these categories:
"Produce", "Meat & Seafood", "Dairy & Eggs", "Bakery", "Pantry & Dry Goods", "Canned & Jarred", "Frozen", "Condiments & Sauces", "Spices & Seasonings", "Drinks", "Other"

Example: {"chicken thighs": "Meat & Seafood", "brown onion": "Produce", "soy sauce": "Condiments & Sauces", "basmati rice": "Pantry & Dry Goods"}`,
          },
          {
            role: 'user',
            content: `Categorise these ingredients: ${itemNames}`,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      }),
    });

    if (!res.ok) {
      console.warn(`Groq API error (${res.status}) – skipping categorisation`);
      return existingCategories;
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return existingCategories;

    const parsed: Record<string, string> = JSON.parse(content);

    // Merge: normalise keys to lowercase, validate categories
    const validCategories = new Set(CATEGORY_ORDER);
    const merged = { ...existingCategories };
    for (const [key, value] of Object.entries(parsed)) {
      const normKey = key.toLowerCase().trim();
      merged[normKey] = validCategories.has(value) ? value : 'Other';
    }

    return merged;
  } catch (err) {
    console.warn('Failed to categorise ingredients:', err);
    return existingCategories;
  }
}

// Override map for ingredients where the name in our recipes doesn't match
// the TheMealDB filename convention. Only add entries here when the automatic
// name-to-filename conversion won't work (e.g. different wording, aliases).
// IMPORTANT: Order matters – more specific keys must come before generic ones.
const INGREDIENT_OVERRIDES: Record<string, string> = {
  // --- Aliases where our recipe name differs from TheMealDB name ---
  'beef mince': 'minced-beef',
  'ground beef': 'minced-beef',
  'ground pork': 'ground-pork',
  'tomato paste': 'tomato-puree',
  'crushed tomato': 'chopped-tomatoes',
  'tinned tomato': 'chopped-tomatoes',
  'canned tomato': 'chopped-tomatoes',
  'stock cube': 'vegetable-stock-cube',
  'bouillon': 'beef-stock',
  'capsicum': 'red-pepper',
  'prawn': 'king-prawns',
  'guanciale': 'bacon',
  'pancetta': 'bacon',
  'yoghurt': 'natural-yoghurt',
  'cayenne': 'cayenne-pepper',
  'chilli flakes': 'red-chilli-flakes',
  'cheddar': 'cheddar-cheese',
  'worcestershire': 'worcestershire-sauce',
  'white sugar': 'sugar',
  'cooking salt': 'salt',
  'sea salt': 'sea-salt',
  'dried bay': 'bay-leaves',
  'bay leaf': 'bay-leaf',
  'dry red wine': 'red-wine',
  'dry white wine': 'white-wine',
  'fresh thyme': 'thyme',
  'fresh basil': 'basil',
  'fresh rosemary': 'rosemary',
  'fresh oregano': 'oregano',
  'fresh parsley': 'parsley',
  'fresh dill': 'dill',
  'fresh coriander': 'coriander',
  'fresh mint': 'fresh-mint',
  'plain flour': 'plain-flour',
  'self raising flour': 'self-raising-flour',
  'self-raising flour': 'self-raising-flour',
  'cornflour': 'cornstarch',
  'scallion': 'spring-onions',
  'shallot': 'shallots',
};

// Generic single-word ingredients for substring fallback matching.
// These catch cases like "chicken or vegetable broth" → matches "chicken".
// Specific composites (above) are checked first so "chicken breast" won't
// accidentally match just "chicken".
const GENERIC_KEYWORDS: string[] = [
  'chicken', 'beef', 'pork', 'lamb', 'fish', 'salmon', 'prawn', 'shrimp',
  'garlic', 'onion', 'carrot', 'mushroom', 'tomato', 'potato', 'celery',
  'broccoli', 'spinach', 'ginger', 'cucumber', 'zucchini', 'corn', 'peas',
  'avocado', 'lemon', 'lime', 'orange', 'apple', 'banana', 'coconut',
  'egg', 'cheese', 'parmesan', 'mozzarella', 'feta', 'butter', 'cream',
  'milk', 'yogurt',
  'rice', 'pasta', 'spaghetti', 'noodle', 'bread', 'flour',
  'sugar', 'salt', 'pepper', 'honey',
  'olive oil', 'sesame oil', 'soy sauce', 'vinegar', 'mustard',
  'oil', 'stock', 'wine', 'water',
  'cumin', 'paprika', 'cinnamon', 'thyme', 'basil', 'oregano', 'rosemary',
  'parsley', 'coriander', 'dill', 'nutmeg', 'turmeric', 'chilli', 'vanilla',
  'bacon', 'tofu', 'chocolate',
];

const BUCKET_BASE = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/ingredient-images`;

/** Convert an ingredient name to the expected bucket filename (without .png) */
function toFilename(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

/**
 * Returns the Supabase storage URL for an ingredient image.
 *
 * Strategy (first match wins):
 * 1. Override map – substring match for known aliases (specific-first)
 * 2. Exact dynamic – construct filename from the full ingredient name
 * 3. Generic keyword – substring match against common ingredient words
 *
 * The IngredientIcon component handles 404s gracefully with onError fallback.
 */
export function getIngredientImageUrl(item: string): string {
  const lower = item.toLowerCase();

  // 1. Check overrides first (substring match)
  for (const [key, filename] of Object.entries(INGREDIENT_OVERRIDES)) {
    if (lower.includes(key)) {
      return `${BUCKET_BASE}/${filename}.png`;
    }
  }

  // 2. Substring match against generic keywords
  //    Catches "garlic cloves" → garlic, "chicken or vegetable broth" → chicken
  for (const keyword of GENERIC_KEYWORDS) {
    if (lower.includes(keyword)) {
      return `${BUCKET_BASE}/${toFilename(keyword)}.png`;
    }
  }

  // 3. Last resort: try a dynamic filename from the item name (onError handles 404)
  return `${BUCKET_BASE}/${toFilename(lower)}.png`;
}

export const FALLBACK_EMOJI = '🥘';

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
};

const BUCKET_BASE = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/ingredient-images`;

/** Convert an ingredient name to the expected bucket filename (without .png) */
function toFilename(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

/**
 * Returns the Supabase storage URL for an ingredient image.
 *
 * Strategy:
 * 1. Check the override map (substring match, specific-first)
 * 2. Try a direct filename from the ingredient name
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

  // 2. Dynamic: construct filename directly from the ingredient name
  const filename = toFilename(lower);
  return `${BUCKET_BASE}/${filename}.png`;
}

export const FALLBACK_EMOJI = '🥘';

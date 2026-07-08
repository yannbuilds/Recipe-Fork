export const INGREDIENT_EMOJI_MAP: Record<string, string> = {
  flour: '🌾',
  sugar: '🍬',
  butter: '🧈',
  eggs: '🥚',
  egg: '🥚',
  milk: '🥛',
  salt: '🧂',
  pepper: '🌶',
  garlic: '🧄',
  onion: '🧅',
  'olive oil': '🫒',
  oil: '🫒',
  water: '💧',
  lemon: '🍋',
  tomato: '🍅',
  parmesan: '🧀',
  cheese: '🧀',
  spaghetti: '🍝',
  pasta: '🍝',
  chicken: '🍗',
  beef: '🥩',
  pork: '🥩',
  fish: '🐟',
  rice: '🍚',
  potato: '🥔',
  carrot: '🥕',
  spinach: '🥬',
  mushroom: '🍄',
  honey: '🍯',
  cream: '🍦',
  wine: '🍷',
  stock: '🫙',
  bread: '🍞',
  guanciale: '🥓',
  pancetta: '🥓',
  bacon: '🥓',
};

export function getIngredientEmoji(item: string): string {
  const lower = item.toLowerCase();
  for (const [key, emoji] of Object.entries(INGREDIENT_EMOJI_MAP)) {
    if (lower.includes(key)) return emoji;
  }
  return '🥘';
}

export const CATEGORY_EMOJI_MAP: Record<string, string> = {
  'Produce': '🥬',
  'Meat & Seafood': '🥩',
  'Dairy & Eggs': '🥛',
  'Bakery': '🍞',
  'Pantry & Dry Goods': '🫙',
  'Canned & Jarred': '🥫',
  'Frozen': '🧊',
  'Condiments & Sauces': '🫒',
  'Spices & Seasonings': '🌶',
  'Drinks': '🥤',
  'Other': '🛒',
};

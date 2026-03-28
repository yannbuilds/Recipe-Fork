import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// TheMealDB name for each ingredient (used in the CDN URL)
const MEALDB_MAP: Record<string, string> = {
  garlic: 'Garlic',
  onion: 'Onion',
  carrot: 'Carrots',
  mushroom: 'Mushrooms',
  egg: 'Egg',
  cheese: 'Cheese',
  lemon: 'Lemon',
  bread: 'Bread',
  chicken: 'Chicken',
  fish: 'Salmon',
  rice: 'Rice',
  pasta: 'Rigatoni',
  honey: 'Honey',
  milk: 'Milk',
  flour: 'Plain Flour',
  tomato: 'Tomatoes',
  beef: 'Beef',
  pork: 'Pork',
  cream: 'Double Cream',
  stock: 'Vegetable Stock',
  bacon: 'Bacon',
  'olive oil': 'Olive Oil',
  butter: 'Butter',
  cumin: 'Cumin',
  thyme: 'Thyme',
  'soy sauce': 'Soy Sauce',
  paprika: 'Paprika',
  cinnamon: 'Cinnamon',
  avocado: 'Avocado',
  corn: 'Corn Flour',
  potato: 'Potatoes',
  broccoli: 'Broccoli',
  spinach: 'Spinach',
  celery: 'Celery',
  ginger: 'Ginger',
  chilli: 'Red Chilli Flakes',
  cucumber: 'Cucumber',
  capsicum: 'Red Pepper',
  zucchini: 'Courgettes',
  peas: 'Peas',
  'sweet potato': 'Sweet Potatoes',
  lime: 'Lime',
  orange: 'Orange',
  apple: 'Apples',
  banana: 'Banana',
  coconut: 'Coconut Cream',
  lamb: 'Lamb',
  prawns: 'King Prawns',
  tofu: 'Tofu',
  yoghurt: 'Natural Yoghurt',
  parmesan: 'Parmesan',
  sugar: 'Sugar',
  salt: 'Salt',
  pepper: 'Pepper',
  vinegar: 'Vinegar',
  'sesame oil': 'Sesame Seed Oil',
  mustard: 'Mustard',
  oregano: 'Oregano',
  basil: 'Basil',
  rosemary: 'Rosemary',
  'bay leaves': 'Bay Leaves',
  nutmeg: 'Nutmeg',
  turmeric: 'Turmeric',
  'chilli flakes': 'Red Chilli Flakes',
  vanilla: 'Vanilla Extract',
  chocolate: 'Dark Chocolate',
  wine: 'Red Wine',
  'coconut milk': 'Coconut Milk',
  water: 'Water',
  oil: 'Vegetable Oil',
  spaghetti: 'Spaghetti',
  guanciale: 'Bacon',
  pancetta: 'Bacon',
};

async function main() {
  const entries = Object.entries(MEALDB_MAP);
  let success = 0;
  let failed = 0;

  for (let i = 0; i < entries.length; i++) {
    const [key, mealdbName] = entries[i];
    const filename = key.replace(/ /g, '-') + '.png';
    const url = `https://www.themealdb.com/images/ingredients/${encodeURIComponent(mealdbName)}-Small.png`;

    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.log(`[${i + 1}/${entries.length}] ${key} -> FAILED (HTTP ${res.status})`);
        failed++;
        continue;
      }

      const buffer = Buffer.from(await res.arrayBuffer());
      const { error } = await supabase.storage
        .from('ingredient-images')
        .upload(filename, buffer, { contentType: 'image/png', upsert: true });

      if (error) {
        console.log(`[${i + 1}/${entries.length}] ${key} -> UPLOAD ERROR: ${error.message}`);
        failed++;
      } else {
        console.log(`[${i + 1}/${entries.length}] ${key} -> uploaded`);
        success++;
      }
    } catch (err) {
      console.log(`[${i + 1}/${entries.length}] ${key} -> ERROR: ${(err as Error).message}`);
      failed++;
    }
  }

  console.log(`\nDone: ${success} uploaded, ${failed} failed out of ${entries.length}`);
}

main();

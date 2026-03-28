import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/** Convert a TheMealDB ingredient name to a bucket filename */
function toFilename(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '.png';
}

async function main() {
  // Fetch full ingredient list from TheMealDB API
  console.log('Fetching ingredient list from TheMealDB...');
  const listRes = await fetch('https://www.themealdb.com/api/json/v1/1/list.php?i=list');
  const listData = await listRes.json() as { meals: { strIngredient: string }[] };
  const ingredients = listData.meals.map((m) => m.strIngredient);
  console.log(`Found ${ingredients.length} ingredients\n`);

  let success = 0;
  let failed = 0;
  const failures: string[] = [];

  for (let i = 0; i < ingredients.length; i++) {
    const name = ingredients[i];
    const filename = toFilename(name);
    const url = `https://www.themealdb.com/images/ingredients/${encodeURIComponent(name)}-Small.png`;

    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.log(`[${i + 1}/${ingredients.length}] ${name} -> FAILED (HTTP ${res.status})`);
        failures.push(name);
        failed++;
        continue;
      }

      const buffer = Buffer.from(await res.arrayBuffer());
      const { error } = await supabase.storage
        .from('ingredient-images')
        .upload(filename, buffer, { contentType: 'image/png', upsert: true });

      if (error) {
        console.log(`[${i + 1}/${ingredients.length}] ${name} -> UPLOAD ERROR: ${error.message}`);
        failures.push(name);
        failed++;
      } else {
        console.log(`[${i + 1}/${ingredients.length}] ${name} -> ${filename}`);
        success++;
      }
    } catch (err) {
      console.log(`[${i + 1}/${ingredients.length}] ${name} -> ERROR: ${(err as Error).message}`);
      failures.push(name);
      failed++;
    }
  }

  console.log(`\nDone: ${success} uploaded, ${failed} failed out of ${ingredients.length}`);
  if (failures.length > 0) {
    console.log('\nFailed ingredients:');
    failures.forEach((f) => console.log(`  - ${f}`));
  }
}

main();

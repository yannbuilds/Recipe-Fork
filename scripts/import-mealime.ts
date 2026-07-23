/**
 * import-mealime.ts
 *
 * Migrate recipes out of Mealime into Recipe Fork.
 *
 * WHY THIS EXISTS: Mealime's app/API locks full recipes (with cooking steps)
 * behind their private app token, so pointing the normal importer at an
 * app.mealime.com / my.mealime.com URL only ever hits a sign-in wall. BUT
 * Mealime's PUBLIC catalogue pages — https://www.mealime.com/recipes/<slug>/<id>
 * — ship the complete recipe as JSON-LD in the raw server HTML (ingredients,
 * every step, servings, times, image). That's exactly what the import-recipe
 * Edge Function eats first, so a public URL round-trips into a native-quality
 * recipe (parsed ingredients, enriched tags, image re-hosted to our storage).
 *
 * This script feeds each public URL through the SAME deployed import-recipe
 * Edge Function the web/mobile apps use, then inserts the returned recipe for
 * the target user via the service role — mirroring scripts/batch-import.ts.
 * Result appears on both web and mobile automatically (shared Supabase).
 *
 * FINDING THE URL: on https://www.mealime.com/recipes, type a recipe's name
 * into the search box; the result links to /recipes/<slug>/<id>. Put those
 * URLs (one per line) in scripts/mealime-urls.txt, or pass them as CLI args.
 *
 * Usage:
 *   npx tsx scripts/import-mealime.ts --dry-run                 # report only
 *   npx tsx scripts/import-mealime.ts                           # read urls file
 *   npx tsx scripts/import-mealime.ts https://www.mealime.com/recipes/.../14320
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;
const TARGET_EMAIL = 'jasonpompon@gmail.com';
const IMPORT_FN = `${SUPABASE_URL}/functions/v1/import-recipe`;
const URLS_FILE = path.resolve('scripts/mealime-urls.txt');
const DRY_RUN = process.argv.includes('--dry-run');

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const normaliseUrl = (u: string) => u.split('#')[0].split('?')[0].replace(/\/$/, '').toLowerCase();

function loadUrls(): string[] {
  const fromArgs = process.argv.slice(2).filter((a) => a.startsWith('http'));
  const fromFile = fs.existsSync(URLS_FILE)
    ? fs.readFileSync(URLS_FILE, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    : [];
  // De-dupe while preserving order.
  return [...new Set([...fromArgs, ...fromFile])];
}

async function resolveUserId(email: string): Promise<string> {
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = data.users.find((u) => (u.email || '').toLowerCase() === email.toLowerCase());
    if (match) return match.id;
    if (data.users.length < 200) throw new Error(`User not found: ${email}`);
    page++;
  }
}

async function loadExistingSourceUrls(userId: string): Promise<Set<string>> {
  const set = new Set<string>();
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('recipes')
      .select('source_url')
      .eq('user_id', userId)
      .range(from, from + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const r of data) if (r.source_url) set.add(normaliseUrl(r.source_url));
    if (data.length < 1000) break;
    from += 1000;
  }
  return set;
}

/** Round-trip a public Mealime URL through the deployed import-recipe function. */
async function extractViaEdge(url: string): Promise<{ recipe: any; tags: any[] } | { error: string }> {
  try {
    const res = await fetch(IMPORT_FN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(60_000),
    });
    const json = await res.json();
    if (!res.ok || json.error) return { error: json.error || `HTTP ${res.status}` };
    return { recipe: { ...json.recipe, source_url: url }, tags: json.tags ?? [] };
  } catch (e: any) {
    return { error: e.message || String(e) };
  }
}

async function upsertTag(name: string, emoji?: string | null): Promise<string> {
  const clean = name.trim().toLowerCase();
  const { data, error } = await supabase
    .from('tags')
    .upsert({ name: clean, emoji: emoji ?? null }, { onConflict: 'name', ignoreDuplicates: false })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

async function insertRecipe(userId: string, recipe: any, tags: any[]): Promise<void> {
  const { data, error } = await supabase
    .from('recipes')
    .insert({
      user_id: userId,
      title: recipe.title,
      description: recipe.description ?? null,
      ingredients: recipe.ingredients,
      steps: recipe.steps,
      source_url: recipe.source_url,
      creator_name: recipe.creator_name ?? null,
      author_notes: recipe.author_notes ?? null,
      image_url: recipe.image_url ?? null,
      video_url: recipe.video_url ?? null,
      servings: recipe.servings ?? null,
      prep_time: recipe.prep_time ?? null,
      cook_time: recipe.cook_time ?? null,
    })
    .select('id')
    .single();
  if (error) throw error;

  const recipeId = data.id;
  for (const t of tags) {
    const name = typeof t === 'string' ? t : t?.name;
    const emoji = typeof t === 'string' ? undefined : t?.emoji;
    if (!name) continue;
    try {
      const tagId = await upsertTag(name, emoji);
      await supabase.from('recipe_tags').insert({ recipe_id: recipeId, tag_id: tagId });
    } catch (e: any) {
      console.warn(`    tag "${name}" failed: ${e.message}`);
    }
  }
}

async function main() {
  const urls = loadUrls();
  if (urls.length === 0) {
    console.log(`No URLs. Add them to ${URLS_FILE} (one per line) or pass as args.`);
    return;
  }

  console.log(`Resolving user_id for ${TARGET_EMAIL}...`);
  const userId = await resolveUserId(TARGET_EMAIL);
  const existing = await loadExistingSourceUrls(userId);
  console.log(`  user_id ${userId} — ${existing.size} existing recipes\n`);

  let inserted = 0, skipped = 0, failed = 0;
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const prefix = `[${i + 1}/${urls.length}]`;
    if (existing.has(normaliseUrl(url))) {
      console.log(`${prefix} SKIP (already imported): ${url}`);
      skipped++;
      continue;
    }
    console.log(`${prefix} ${url}`);
    const result = await extractViaEdge(url);
    if ('error' in result) {
      console.log(`    FAIL: ${result.error}`);
      failed++;
      continue;
    }
    const { recipe, tags } = result;
    console.log(`    → "${recipe.title}" — ${recipe.ingredients?.length} ingredients, ${recipe.steps?.length} steps, ${recipe.servings ?? '?'} servings`);
    if (DRY_RUN) { inserted++; continue; }
    try {
      await insertRecipe(userId, recipe, tags);
      existing.add(normaliseUrl(url));
      inserted++;
      console.log(`    OK inserted (tags: ${tags.map((t: any) => t.name).join(', ') || 'none'})`);
    } catch (e: any) {
      console.log(`    INSERT FAIL: ${e.message}`);
      failed++;
    }
    if (i < urls.length - 1) await new Promise((r) => setTimeout(r, 400));
  }

  console.log(`\nDone${DRY_RUN ? ' (DRY RUN — nothing written)' : ''}. inserted=${inserted} skipped=${skipped} failed=${failed}`);
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TARGET_EMAIL = 'jasonpompon@gmail.com';
const DATA_FILE = path.resolve('scripts/import-recipes.data.json');
const PENDING_FILE = path.resolve('scripts/import-recipes.pending.txt');
const FAILED_FILE = path.resolve('scripts/import-recipes.failed.txt');

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface RecipeIn {
  title: string;
  description?: string | null;
  source_url: string;
  creator_name?: string | null;
  image_url?: string | null;
  video_url?: string | null;
  servings?: number | null;
  prep_time?: number | null;
  cook_time?: number | null;
  author_notes?: string | null;
  ingredients: Array<{ item: string; quantity?: string; unit?: string; original_text?: string }>;
  steps: Array<{ order: number; instruction: string }>;
  tags?: string[];
}

const normaliseUrl = (u: string) => u.split('#')[0].replace(/\/$/, '').toLowerCase();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const isRateLimit = (e: any) => {
  const msg = (e?.message || '').toLowerCase();
  return e?.status === 429 || e?.code === '429' || msg.includes('rate') || msg.includes('quota') || msg.includes('too many');
};

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
  const size = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('recipes')
      .select('source_url')
      .eq('user_id', userId)
      .range(from, from + size - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const r of data) if (r.source_url) set.add(normaliseUrl(r.source_url));
    if (data.length < size) break;
    from += size;
  }
  return set;
}

async function upsertTag(name: string): Promise<string> {
  const clean = name.trim().toLowerCase();
  const { data: existing } = await supabase.from('tags').select('id').eq('name', clean).maybeSingle();
  if (existing) return existing.id;
  const { data, error } = await supabase.from('tags').insert({ name: clean }).select('id').single();
  if (error) throw error;
  return data.id;
}

async function insertRecipe(userId: string, r: RecipeIn): Promise<void> {
  const { data, error } = await supabase
    .from('recipes')
    .insert({
      user_id: userId,
      title: r.title,
      description: r.description ?? null,
      ingredients: r.ingredients,
      steps: r.steps,
      source_url: r.source_url,
      creator_name: r.creator_name ?? null,
      author_notes: r.author_notes ?? null,
      image_url: r.image_url ?? null,
      video_url: r.video_url ?? null,
      servings: r.servings ?? null,
      prep_time: r.prep_time ?? null,
      cook_time: r.cook_time ?? null,
    })
    .select('id')
    .single();
  if (error) throw error;
  const recipeId = data.id;

  if (r.tags?.length) {
    for (const tagName of r.tags) {
      try {
        const tagId = await upsertTag(tagName);
        await supabase.from('recipe_tags').insert({ recipe_id: recipeId, tag_id: tagId });
      } catch (e: any) {
        console.warn(`  tag "${tagName}" failed: ${e.message}`);
      }
    }
  }
}

function appendLine(file: string, line: string) {
  fs.appendFileSync(file, line + '\n');
}

async function main() {
  if (!fs.existsSync(DATA_FILE)) {
    console.error(`Missing ${DATA_FILE}. Populate with extracted recipes first.`);
    process.exit(1);
  }
  const recipes: RecipeIn[] = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  console.log(`Loaded ${recipes.length} recipes from data file`);

  console.log(`Resolving user_id for ${TARGET_EMAIL}...`);
  const userId = await resolveUserId(TARGET_EMAIL);
  console.log(`  user_id: ${userId}`);

  console.log('Loading existing source_urls...');
  const existing = await loadExistingSourceUrls(userId);
  console.log(`  ${existing.size} existing recipes for this user`);

  let inserted = 0,
    skipped = 0,
    failed = 0;

  for (const r of recipes) {
    const key = normaliseUrl(r.source_url);
    if (existing.has(key)) {
      skipped++;
      console.log(`SKIP (exists): ${r.title}`);
      continue;
    }
    try {
      await insertRecipe(userId, r);
      existing.add(key);
      inserted++;
      console.log(`OK: ${r.title}`);
      await sleep(1000);
    } catch (e: any) {
      if (isRateLimit(e)) {
        console.error(`RATE LIMIT hit on "${r.title}". Saving pending list and exiting.`);
        appendLine(PENDING_FILE, r.source_url);
        for (const remaining of recipes.slice(recipes.indexOf(r) + 1)) {
          if (!existing.has(normaliseUrl(remaining.source_url))) appendLine(PENDING_FILE, remaining.source_url);
        }
        break;
      }
      failed++;
      appendLine(FAILED_FILE, `${r.source_url}\t${e.message}`);
      console.error(`FAIL: ${r.title} — ${e.message}`);
    }
  }

  console.log(`\nDone. inserted=${inserted} skipped=${skipped} failed=${failed}`);
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});

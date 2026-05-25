import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TARGET_EMAIL = 'jasonpompon@gmail.com';
const DATA_FILE = path.resolve('scripts/import-recipes.data.json');
const FAILED_FILE = path.resolve('scripts/import-recipes.failed.txt');

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface ParsedRecipe {
  title: string;
  description?: string | null;
  ingredients: Array<{ item: string; quantity?: string; unit?: string; category?: string; original_text?: string }>;
  steps: Array<{ order: number; instruction: string; category?: string }>;
  source_url: string;
  creator_name?: string | null;
  video_url?: string | null;
  image_url?: string | null;
  servings?: number | null;
  prep_time?: number | null;
  cook_time?: number | null;
  author_notes?: string | null;
  tags?: Array<{ name: string; emoji?: string } | string>;
}

const normaliseUrl = (u: string) => u.split('#')[0].replace(/\/$/, '').toLowerCase();

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

async function insertRecipe(userId: string, r: ParsedRecipe): Promise<void> {
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
    for (const t of r.tags) {
      const name = typeof t === 'string' ? t : t?.name;
      const emoji = typeof t === 'string' ? undefined : t?.emoji;
      if (!name) continue;
      try {
        const tagId = await upsertTag(name, emoji);
        await supabase.from('recipe_tags').insert({ recipe_id: recipeId, tag_id: tagId });
      } catch (e: any) {
        console.warn(`  tag "${name}" failed: ${e.message}`);
      }
    }
  }
}

function appendLine(file: string, line: string) {
  fs.appendFileSync(file, line + '\n');
}

async function main() {
  if (!fs.existsSync(DATA_FILE)) {
    console.error(`Missing ${DATA_FILE}`);
    process.exit(1);
  }
  const recipes: ParsedRecipe[] = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  console.log(`Loaded ${recipes.length} recipes from data file`);

  console.log(`Resolving user_id for ${TARGET_EMAIL}...`);
  const userId = await resolveUserId(TARGET_EMAIL);
  console.log(`  user_id: ${userId}`);

  console.log('Loading existing source_urls...');
  const existing = await loadExistingSourceUrls(userId);
  console.log(`  ${existing.size} existing recipes for this user\n`);

  let inserted = 0, skipped = 0, failed = 0;

  for (let i = 0; i < recipes.length; i++) {
    const r = recipes[i];
    if (!r.source_url) {
      console.warn(`[${i + 1}/${recipes.length}] SKIP (no source_url)`);
      skipped++;
      continue;
    }
    const key = normaliseUrl(r.source_url);
    const prefix = `[${i + 1}/${recipes.length}]`;
    if (existing.has(key)) {
      skipped++;
      console.log(`${prefix} SKIP (exists): ${r.source_url}`);
      continue;
    }
    try {
      await insertRecipe(userId, r);
      existing.add(key);
      inserted++;
      console.log(`${prefix} OK: ${r.title}`);
    } catch (e: any) {
      failed++;
      appendLine(FAILED_FILE, `${r.source_url}\t${e.message}`);
      console.error(`${prefix} FAIL: ${r.source_url} — ${e.message}`);
    }
  }

  console.log(`\nDone. inserted=${inserted} skipped=${skipped} failed=${failed}`);
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});

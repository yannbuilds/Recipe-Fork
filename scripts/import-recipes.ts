import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const TARGET_EMAIL = 'jasonpompon@gmail.com';
const URL_FILE = path.resolve('scripts/import-recipes.todo.json');
const PENDING_FILE = path.resolve('scripts/import-recipes.pending.txt');
const FAILED_FILE = path.resolve('scripts/import-recipes.failed.txt');

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
  console.error('Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or VITE_SUPABASE_ANON_KEY');
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
  source_url?: string;
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
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const isRateLimit = (e: any) => {
  const msg = (e?.message || '').toLowerCase();
  return e?.status === 429 || e?.code === '429' || msg.includes('rate') || msg.includes('quota') || msg.includes('too many') || msg.includes('daily limit');
};

class RateLimitError extends Error {
  status = 429;
}

async function fetchRecipeFromEdge(url: string): Promise<ParsedRecipe> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/import-recipe`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url }),
  });
  if (res.status === 429) throw new RateLimitError('Edge function rate limited (Groq daily cap likely)');
  const body = await res.json();
  if (!res.ok || body.error) throw new Error(body.error || `Edge function HTTP ${res.status}`);
  return body.recipe as ParsedRecipe;
}

async function extractVideoFromUrl(sourceUrl: string): Promise<string | null> {
  try {
    const res = await fetch(sourceUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const ids = new Set<string>();
    const patterns = [
      /youtube(?:-nocookie)?\.com\/embed\/([a-zA-Z0-9_-]{11})/g,
      /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/g,
      /youtu\.be\/([a-zA-Z0-9_-]{11})/g,
    ];
    for (const p of patterns) {
      let m;
      while ((m = p.exec(html)) !== null) ids.add(m[1]);
    }
    const first = [...ids][0];
    return first ? `https://www.youtube.com/watch?v=${first}` : null;
  } catch {
    return null;
  }
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
  const { data: existing } = await supabase.from('tags').select('id,emoji').eq('name', clean).maybeSingle();
  if (existing) {
    if (emoji && !existing.emoji) {
      await supabase.from('tags').update({ emoji }).eq('id', existing.id);
    }
    return existing.id;
  }
  const { data, error } = await supabase
    .from('tags')
    .insert({ name: clean, emoji: emoji ?? null })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

async function insertRecipe(userId: string, sourceUrl: string, r: ParsedRecipe): Promise<void> {
  let videoUrl = r.video_url ?? null;
  if (!videoUrl) {
    videoUrl = await extractVideoFromUrl(sourceUrl);
    if (videoUrl) console.log(`  + found video via HTML scan: ${videoUrl}`);
  }
  const { data, error } = await supabase
    .from('recipes')
    .insert({
      user_id: userId,
      title: r.title,
      description: r.description ?? null,
      ingredients: r.ingredients,
      steps: r.steps,
      source_url: sourceUrl,
      creator_name: r.creator_name ?? null,
      author_notes: r.author_notes ?? null,
      image_url: r.image_url ?? null,
      video_url: videoUrl,
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
  if (!fs.existsSync(URL_FILE)) {
    console.error(`Missing ${URL_FILE}`);
    process.exit(1);
  }
  const urls: string[] = JSON.parse(fs.readFileSync(URL_FILE, 'utf8'));
  console.log(`Loaded ${urls.length} URLs from todo list`);

  console.log(`Resolving user_id for ${TARGET_EMAIL}...`);
  const userId = await resolveUserId(TARGET_EMAIL);
  console.log(`  user_id: ${userId}`);

  console.log('Loading existing source_urls...');
  const existing = await loadExistingSourceUrls(userId);
  console.log(`  ${existing.size} existing recipes for this user\n`);

  let inserted = 0,
    skipped = 0,
    failed = 0;

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const key = normaliseUrl(url);
    const prefix = `[${i + 1}/${urls.length}]`;
    if (existing.has(key)) {
      skipped++;
      console.log(`${prefix} SKIP (exists): ${url}`);
      continue;
    }
    try {
      const recipe = await fetchRecipeFromEdge(url);
      await insertRecipe(userId, url, recipe);
      existing.add(key);
      inserted++;
      console.log(`${prefix} OK: ${recipe.title}`);
      await sleep(1500);
    } catch (e: any) {
      if (isRateLimit(e) || e instanceof RateLimitError) {
        console.error(`\n${prefix} RATE LIMIT hit. Saving pending list and exiting.`);
        appendLine(PENDING_FILE, url);
        for (const remaining of urls.slice(i + 1)) {
          if (!existing.has(normaliseUrl(remaining))) appendLine(PENDING_FILE, remaining);
        }
        break;
      }
      failed++;
      appendLine(FAILED_FILE, `${url}\t${e.message}`);
      console.error(`${prefix} FAIL: ${url} — ${e.message}`);
    }
  }

  console.log(`\nDone. inserted=${inserted} skipped=${skipped} failed=${failed}`);
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});

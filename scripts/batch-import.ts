/**
 * batch-import.ts
 *
 * Extracts + imports a batch of recipes from the pending list.
 * - Calls the deployed import-recipe edge function for extraction (Groq)
 * - Inserts directly into Supabase
 * - Handles rate limits gracefully (stops and saves remaining pending)
 * - Skips URLs already in the DB and known failures
 *
 * Run: npx tsx scripts/batch-import.ts [--batch 20]
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)!;
const SUPABASE_ANON_KEY = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY)!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const TARGET_EMAIL = 'jasonpompon@gmail.com';

const PENDING_FILE = path.resolve('scripts/import-recipes.pending.txt');
const FAILED_FILE = path.resolve('scripts/import-recipes.failed.txt');

const BATCH_SIZE = (() => {
  const idx = process.argv.indexOf('--batch');
  return idx !== -1 ? parseInt(process.argv[idx + 1], 10) : 20;
})();

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const EDGE_FN_URL = `${SUPABASE_URL}/functions/v1/import-recipe`;
const AUTH_KEY = SUPABASE_ANON_KEY || SUPABASE_SERVICE_ROLE_KEY;

// ── Helpers ────────────────────────────────────────────────────────────────────

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

async function extractRecipe(url: string): Promise<{ recipe: any; tags: any[] } | { error: string } | null> {
  try {
    const res = await fetch(EDGE_FN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${AUTH_KEY}`,
        apikey: AUTH_KEY,
      },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(30_000),
    });

    if (res.status === 429) return { error: 'RATE_LIMIT' };

    const body = await res.json();
    if (!res.ok) return { error: body.error ?? `HTTP ${res.status}` };
    return body;
  } catch (e: any) {
    return { error: e.message };
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
      console.warn(`  tag "${name}" failed: ${e.message}`);
    }
  }
}

function appendLine(file: string, line: string) {
  fs.appendFileSync(file, line + '\n');
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  if (!fs.existsSync(PENDING_FILE)) {
    console.log('No pending file found. Nothing to do.');
    return;
  }

  const allPending = fs.readFileSync(PENDING_FILE, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  if (allPending.length === 0) {
    console.log('Pending list is empty. Nothing to do.');
    return;
  }

  // Load known failures to skip them
  const knownFailed = new Set<string>();
  if (fs.existsSync(FAILED_FILE)) {
    for (const line of fs.readFileSync(FAILED_FILE, 'utf8').split('\n')) {
      const url = line.split('\t')[0].trim();
      if (url) knownFailed.add(normaliseUrl(url));
    }
  }

  console.log(`Resolving user_id for ${TARGET_EMAIL}...`);
  const userId = await resolveUserId(TARGET_EMAIL);
  console.log(`  user_id: ${userId}`);

  console.log('Loading existing source_urls from Supabase...');
  const existing = await loadExistingSourceUrls(userId);
  console.log(`  ${existing.size} existing recipes\n`);

  // Pick the next batch (skip existing + known failures)
  const batch: string[] = [];
  const skippedUrls: string[] = [];

  for (const url of allPending) {
    const key = normaliseUrl(url);
    if (existing.has(key) || knownFailed.has(key)) {
      skippedUrls.push(url);
    } else if (batch.length < BATCH_SIZE) {
      batch.push(url);
    }
  }

  const remainingAfterBatch = allPending.filter(
    (u) => !batch.includes(u) && !skippedUrls.includes(u),
  );

  console.log(`Batch size: ${batch.length} URLs to process`);
  console.log(`Skipping ${skippedUrls.length} (already in DB or known failures)`);
  console.log(`${remainingAfterBatch.length} URLs will remain pending after this run\n`);

  let inserted = 0;
  let skipped = 0;
  let failed = 0;
  let rateLimited = false;
  const processedUrls: string[] = [];

  for (let i = 0; i < batch.length; i++) {
    const url = batch[i];
    const prefix = `[${i + 1}/${batch.length}]`;
    process.stdout.write(`${prefix} ${url}\n`);

    const result = await extractRecipe(url);

    if (!result) {
      console.log(`  FAIL: null response`);
      appendLine(FAILED_FILE, `${url}\tnull response`);
      failed++;
      processedUrls.push(url);
      continue;
    }

    if ('error' in result) {
      if (result.error === 'RATE_LIMIT') {
        console.log(`\n  RATE LIMIT hit at item ${i + 1}. Stopping.\n`);
        rateLimited = true;
        break;
      }
      console.log(`  FAIL: ${result.error}`);
      appendLine(FAILED_FILE, `${url}\t${result.error}`);
      failed++;
      processedUrls.push(url);
      continue;
    }

    const { recipe, tags } = result;
    recipe.source_url = url;

    try {
      await insertRecipe(userId, recipe, tags ?? []);
      existing.add(normaliseUrl(url));
      inserted++;
      processedUrls.push(url);
      console.log(`  OK: ${recipe.title}`);
    } catch (e: any) {
      console.error(`  INSERT FAIL: ${e.message}`);
      appendLine(FAILED_FILE, `${url}\t${e.message}`);
      failed++;
      processedUrls.push(url);
    }

    // Small delay to be polite to the sites being fetched
    if (i < batch.length - 1) await new Promise((r) => setTimeout(r, 500));
  }

  // Rewrite pending file: remove processed, keep unprocessed batch items + remaining
  const unprocessedBatch = batch.filter((u) => !processedUrls.includes(u));
  const newPending = [...unprocessedBatch, ...remainingAfterBatch];
  fs.writeFileSync(PENDING_FILE, newPending.join('\n') + (newPending.length > 0 ? '\n' : ''));

  console.log(`\nDone. inserted=${inserted} skipped=${skipped} failed=${failed}`);
  console.log(`${newPending.length} URLs remain in pending.txt`);
  if (rateLimited) {
    console.log('Rate limited — remaining URLs saved. Run again tomorrow or later.');
  }
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});

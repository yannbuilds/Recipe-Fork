/**
 * patch-recipe-metadata.ts
 *
 * For every recipe in the DB owned by TARGET_EMAIL, fetches the raw HTML
 * and re-extracts author_notes and video_url using the same logic as the
 * import-recipe edge function. Updates any recipe where these fields are
 * null or empty.
 *
 * Run: npx tsx scripts/patch-recipe-metadata.ts
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TARGET_EMAIL = 'jasonpompon@gmail.com';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── Extraction helpers (ported from edge function) ──────────────────────────

function extractVideoUrls(html: string): string[] {
  const ids = new Set<string>();
  const patterns = [
    /youtube(?:-nocookie)?\.com\/embed\/([a-zA-Z0-9_-]{11})/g,
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/g,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      ids.add(match[1]);
    }
  }
  return [...ids].map((id) => `https://www.youtube.com/watch?v=${id}`);
}

function extractRecipeNotes(html: string): string | null {
  // 1. WPRM notes container (WordPress Recipe Maker — used by RecipeTinEats)
  const wprmMatch = html.match(
    /<div[^>]*class="[^"]*wprm-recipe-notes[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i,
  );
  if (wprmMatch) {
    let text = wprmMatch[1];
    text = text.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/<\/span>\s*(<div[^>]*class="wprm-spacer"[^>]*><\/div>)?\s*/gi, '\n');
    text = text.replace(/<[^>]+>/g, '');
    text = text
      .replace(/&rsquo;/g, '’')
      .replace(/&lsquo;/g, '‘')
      .replace(/&ldquo;/g, '“')
      .replace(/&rdquo;/g, '”')
      .replace(/&ndash;/g, '–')
      .replace(/&mdash;/g, '—')
      .replace(/&hellip;/g, '…')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&#(\d+);/g, (_: string, code: string) => String.fromCharCode(parseInt(code, 10)));
    text = text.replace(/\n{3,}/g, '\n\n').trim();
    if (text.length > 20) return text;
  }

  // 2. Generic: heading-based "Notes", "Recipe Notes", "Tips" sections
  const headingPattern =
    /<h[2-6][^>]*>[^<]*(?:Recipe\s+Notes?|Author'?s?\s+Notes?|Notes|Tips)[^<]*<\/h[2-6]>/gi;
  let headingMatch;
  while ((headingMatch = headingPattern.exec(html)) !== null) {
    const afterHeading = html.slice(
      headingMatch.index + headingMatch[0].length,
      headingMatch.index + headingMatch[0].length + 5000,
    );
    const endMatch = afterHeading.match(
      /<h[2-6][^>]*>|<div[^>]*class="[^"]*(?:recipe-card|wprm-recipe-container|comment)/i,
    );
    const content = endMatch ? afterHeading.slice(0, endMatch.index) : afterHeading;

    let text = content
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(?:p|li|div|span)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&rsquo;/g, '’')
      .replace(/&lsquo;/g, '‘')
      .replace(/&ldquo;/g, '“')
      .replace(/&rdquo;/g, '”')
      .replace(/&ndash;/g, '–')
      .replace(/&mdash;/g, '—')
      .replace(/&hellip;/g, '…')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&#(\d+);/g, (_: string, code: string) => String.fromCharCode(parseInt(code, 10)))
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    if (text.length > 20) return text;
  }

  return null;
}

// ─── Page fetcher ─────────────────────────────────────────────────────────────

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-AU,en;q=0.9,en-US;q=0.8',
        'Upgrade-Insecure-Requests': '1',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.warn(`  HTTP ${res.status} for ${url}`);
      return null;
    }
    return await res.text();
  } catch (e: any) {
    console.warn(`  Fetch error for ${url}: ${e.message}`);
    return null;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

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

async function main() {
  console.log(`Resolving user_id for ${TARGET_EMAIL}...`);
  const userId = await resolveUserId(TARGET_EMAIL);
  console.log(`  user_id: ${userId}\n`);

  // Fetch all recipes for this user
  const { data: recipes, error } = await supabase
    .from('recipes')
    .select('id, title, source_url, author_notes, video_url')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  console.log(`Found ${recipes.length} recipes total\n`);

  // Patch those missing author_notes/video_url OR with HTML entities in author_notes
  const hasEntities = (s: string | null) => s && /&[a-z]+;|&#\d+;/.test(s);
  const toPatch = recipes.filter(
    (r) => !r.author_notes || !r.video_url || hasEntities(r.author_notes),
  );
  console.log(`Recipes needing patch: ${toPatch.length}\n`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < toPatch.length; i++) {
    const r = toPatch[i];
    const prefix = `[${i + 1}/${toPatch.length}]`;
    console.log(`${prefix} ${r.title}`);
    console.log(`  URL: ${r.source_url}`);
    console.log(`  author_notes: ${r.author_notes ? '✓ present' : '✗ missing'}`);
    console.log(`  video_url:    ${r.video_url ? '✓ ' + r.video_url : '✗ missing'}`);

    if (!r.source_url) {
      console.log('  SKIP (no source_url)\n');
      skipped++;
      continue;
    }

    const html = await fetchHtml(r.source_url);
    if (!html) {
      console.log('  SKIP (fetch failed)\n');
      failed++;
      continue;
    }

    const needsNotes = !r.author_notes || hasEntities(r.author_notes);
    const newNotes = needsNotes ? extractRecipeNotes(html) : null;
    const videoUrls = extractVideoUrls(html);
    const newVideoUrl = r.video_url ? null : (videoUrls[0] ?? null);

    if (!newNotes && !newVideoUrl) {
      console.log('  No new data found — skipping update\n');
      skipped++;
      continue;
    }

    const patch: Record<string, string | null> = {};
    if (newNotes) {
      patch.author_notes = newNotes;
      console.log(`  → author_notes: ${newNotes.slice(0, 80)}…`);
    }
    if (newVideoUrl) {
      patch.video_url = newVideoUrl;
      console.log(`  → video_url: ${newVideoUrl}`);
    }

    const { error: updateError } = await supabase
      .from('recipes')
      .update(patch)
      .eq('id', r.id);

    if (updateError) {
      console.error(`  FAIL: ${updateError.message}\n`);
      failed++;
    } else {
      console.log('  ✓ Updated\n');
      updated++;
    }

    // Small delay to avoid hammering the site
    await new Promise((res) => setTimeout(res, 500));
  }

  console.log(`\nDone. updated=${updated} skipped=${skipped} failed=${failed}`);
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});

/**
 * patch-recipe-metadata.ts
 *
 * For every recipe in the DB owned by TARGET_EMAIL that is missing
 * author_notes or video_url, re-fetches the page and patches the row.
 *
 * EXTRACTION STRATEGY (two-phase, mirrors the Chrome extension approach):
 *
 *   Phase 1 — Local HTML fetch + regex (fast, no rate limits)
 *     Fetches the page HTML directly and runs the same extraction helpers
 *     as the import-recipe edge function (WPRM notes, YouTube video URLs,
 *     heading-based notes). Works for any server-rendered recipe site.
 *
 *   Phase 2 — Edge function fallback (Groq LLM, rate-limited)
 *     If Phase 1 finds nothing for a recipe, falls back to the full edge
 *     function extraction pipeline (same as what the Chrome extension does).
 *     Use sparingly — Groq has a daily token limit. Pass HTML to avoid
 *     relying on the edge function's own fetch.
 *
 * Run: npx tsx scripts/patch-recipe-metadata.ts
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { extractRecipeWithClaude } from './recipe-extractor.js';

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const TARGET_EMAIL = 'jasonpompon@gmail.com';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Browser-like headers — same as the extension's grabPageHtml + batch-import
const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-AU,en;q=0.9,en-US;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Upgrade-Insecure-Requests': '1',
};

// ── Phase 1: HTML fetch + regex ────────────────────────────────────────────────

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: FETCH_HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      console.log(`  HTML fetch: HTTP ${res.status}`);
      return null;
    }
    const html = await res.text();
    return html.length > 2_000_000 ? html.slice(0, 2_000_000) : html;
  } catch (e: any) {
    console.log(`  HTML fetch error: ${e.message}`);
    return null;
  }
}

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

const HTML_ENTITIES: Record<string, string> = {
  '&rsquo;': '’', '&lsquo;': '‘',
  '&ldquo;': '“', '&rdquo;': '”',
  '&ndash;': '–', '&mdash;': '—',
  '&hellip;': '…', '&amp;': '&',
  '&lt;': '<', '&gt;': '>',
  '&quot;': '"', '&#39;': "'",
  '&nbsp;': ' ', '&Prime;': '″',
};

function decodeEntities(text: string): string {
  let out = text;
  for (const [entity, char] of Object.entries(HTML_ENTITIES)) {
    out = out.replaceAll(entity, char);
  }
  // Numeric entities
  out = out.replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(parseInt(code, 10)));
  return out;
}

function extractRecipeNotes(html: string): string | null {
  // 1. WPRM notes container (WordPress Recipe Maker — used by RecipeTin Eats etc.)
  const wprmMatch = html.match(
    /<div[^>]*class="[^"]*wprm-recipe-notes[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i,
  );
  if (wprmMatch) {
    let text = wprmMatch[1];
    text = text.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/<\/span>\s*(<div[^>]*class="wprm-spacer"[^>]*><\/div>)?\s*/gi, '\n');
    text = text.replace(/<[^>]+>/g, '');
    text = decodeEntities(text);
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
      .replace(/<[^>]+>/g, '');
    text = decodeEntities(text);
    text = text.replace(/\n{3,}/g, '\n\n').trim();

    if (text.length > 20) return text;
  }

  return null;
}

// ── Phase 2: Claude LLM fallback ──────────────────────────────────────────────

/**
 * Re-extract the full recipe via Claude and return only the fields we need.
 * Only called when regex extraction finds nothing — avoids unnecessary API calls.
 */
async function extractViaClauде(
  url: string,
  html: string,
): Promise<{ author_notes: string | null; video_url: string | null } | null> {
  const result = await extractRecipeWithClaude(url, html);
  if ('error' in result) {
    console.log(`  Claude extraction error: ${result.error}`);
    return null;
  }
  return {
    author_notes: result.recipe.author_notes ?? null,
    video_url: result.recipe.video_url ?? null,
  };
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

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Resolving user_id for ${TARGET_EMAIL}...`);
  const userId = await resolveUserId(TARGET_EMAIL);
  console.log(`  user_id: ${userId}\n`);

  const { data: recipes, error } = await supabase
    .from('recipes')
    .select('id, title, source_url, author_notes, video_url')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  console.log(`Found ${recipes.length} recipes total\n`);

  const toPatch = recipes.filter((r) => !r.author_notes || !r.video_url);
  console.log(`Recipes needing patch: ${toPatch.length}\n`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < toPatch.length; i++) {
    const r = toPatch[i];
    const prefix = `[${i + 1}/${toPatch.length}]`;
    console.log(`${prefix} ${r.title}`);
    console.log(`  author_notes: ${r.author_notes ? '✓ present' : '✗ missing'}`);
    console.log(`  video_url:    ${r.video_url ? '✓ ' + r.video_url : '✗ missing'}`);

    if (!r.source_url) {
      console.log('  SKIP (no source_url)\n');
      skipped++;
      continue;
    }

    // ── Phase 1: local HTML fetch + regex ─────────────────────────────────────
    const html = await fetchHtml(r.source_url);

    let newNotes: string | null = null;
    let newVideo: string | null = null;

    if (html) {
      if (!r.author_notes) newNotes = extractRecipeNotes(html);
      if (!r.video_url) {
        const videos = extractVideoUrls(html);
        newVideo = videos[0] ?? null;
      }
    }

    // ── Phase 2: edge function fallback for non-WPRM sites ────────────────────
    // Only call the LLM if regex found nothing and we're missing fields.
    const stillMissingNotes = !r.author_notes && !newNotes;
    const stillMissingVideo = !r.video_url && !newVideo;

    if (html && (stillMissingNotes || stillMissingVideo)) {
      console.log(`  Regex found nothing → trying Claude (LLM)`);
      const extracted = await extractViaClauде(r.source_url, html);
      if (extracted) {
        if (stillMissingNotes && extracted.author_notes) newNotes = extracted.author_notes;
        if (stillMissingVideo && extracted.video_url) newVideo = extracted.video_url;
      }
    }

    // ── Patch the DB ──────────────────────────────────────────────────────────
    const patch: Record<string, string | null> = {};
    if (!r.author_notes && newNotes) {
      patch.author_notes = newNotes;
      console.log(`  → author_notes: ${newNotes.slice(0, 80)}…`);
    }
    if (!r.video_url && newVideo) {
      patch.video_url = newVideo;
      console.log(`  → video_url: ${newVideo}`);
    }

    if (Object.keys(patch).length === 0) {
      console.log('  No new data found — skipping update\n');
      skipped++;
      await new Promise((res) => setTimeout(res, 300));
      continue;
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

    await new Promise((res) => setTimeout(res, 500));
  }

  console.log(`\nDone. updated=${updated} skipped=${skipped} failed=${failed}`);
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});

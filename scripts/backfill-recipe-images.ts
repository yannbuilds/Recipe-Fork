/**
 * Backfill: mirror every externally-hosted recipe image into the
 * `recipe-images` Supabase Storage bucket and point recipes.image_url at it.
 *
 * Why: hotlinked images rot (11 RecipeTin Eats URLs are already dead) and
 * depend on source sites tolerating hotlinks. New imports are re-hosted by
 * the import-recipe Edge Function; this migrates everything saved before.
 *
 * Recovery ladder for each recipe:
 *   1. Download image_url directly (browser headers + source page Referer).
 *   2. If dead: re-scrape source_url for a fresh JSON-LD / og:image URL.
 *   3. If still dead: Wayback Machine snapshot of the original image URL.
 *
 * Idempotent: bucket path is `backfill-<recipe-id>.<ext>` with upsert, and
 * recipes already pointing at Supabase Storage are skipped.
 *
 * Usage:
 *   npx tsx scripts/backfill-recipe-images.ts --dry-run   # report only
 *   npx tsx scripts/backfill-recipe-images.ts             # migrate
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
  process.exit(1);
}

const DRY_RUN = process.argv.includes('--dry-run');
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const supabaseHost = new URL(SUPABASE_URL).hostname;

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
};

interface RecipeRow {
  id: string;
  title: string;
  image_url: string;
  source_url: string | null;
}

interface Downloaded {
  bytes: ArrayBuffer;
  contentType: string;
  via: 'direct' | 'rescrape' | 'wayback';
}

/** Retry transient failures (Supabase socket errors, rate limits) with backoff. */
async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
  throw lastError;
}

async function downloadImage(
  url: string,
  referer: string | null,
): Promise<{ bytes: ArrayBuffer; contentType: string } | null> {
  try {
    const res = await fetch(url, {
      headers: { ...BROWSER_HEADERS, ...(referer ? { Referer: referer } : {}) },
      redirect: 'follow',
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return null;
    let contentType = res.headers.get('content-type') ?? 'image/jpeg';
    // Some CDNs (e.g. Nestlé's S3) serve images as application/octet-stream —
    // trust an image file extension in the URL over a generic content type.
    if (!contentType.startsWith('image/')) {
      const extMatch = new URL(url).pathname.match(/\.(jpe?g|png|webp|gif|avif)$/i);
      if (!extMatch) return null;
      const ext = extMatch[1].toLowerCase();
      contentType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
    }
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength === 0 || bytes.byteLength > 15_000_000) return null;
    return { bytes, contentType };
  } catch {
    return null;
  }
}

/** Pull a fresh image URL out of the source page's JSON-LD or og:image. */
async function rescrapeImageUrl(sourceUrl: string): Promise<string | null> {
  try {
    const res = await fetch(sourceUrl, {
      headers: {
        ...BROWSER_HEADERS,
        Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return null;
    const html = await res.text();

    // JSON-LD Recipe image first — it's the canonical hero shot.
    const ldRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let m: RegExpExecArray | null;
    while ((m = ldRegex.exec(html)) !== null) {
      if (!m[1].includes('Recipe')) continue;
      try {
        const parsed = JSON.parse(m[1].trim());
        const nodes: unknown[] = [];
        const collect = (v: unknown) => {
          if (Array.isArray(v)) v.forEach(collect);
          else if (v && typeof v === 'object') {
            const o = v as Record<string, unknown>;
            if (Array.isArray(o['@graph'])) o['@graph'].forEach(collect);
            nodes.push(o);
          }
        };
        collect(parsed);
        const recipe = nodes.find((n) => {
          const t = (n as Record<string, unknown>)['@type'];
          return t === 'Recipe' || (Array.isArray(t) && t.includes('Recipe'));
        }) as Record<string, unknown> | undefined;
        const firstUrl = (v: unknown): string | null => {
          if (typeof v === 'string') return v.trim() || null;
          if (Array.isArray(v)) {
            for (const x of v) {
              const u = firstUrl(x);
              if (u) return u;
            }
            return null;
          }
          if (v && typeof v === 'object') {
            return firstUrl((v as Record<string, unknown>).url);
          }
          return null;
        };
        const img = recipe ? firstUrl(recipe.image) : null;
        if (img) return img;
      } catch {
        /* try next script block */
      }
    }

    // og:image fallback
    const og =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ??
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    return og?.[1] ?? null;
  } catch {
    return null;
  }
}

/** Last resort: Wayback Machine snapshot of the dead image URL. */
async function waybackImageUrl(imageUrl: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://archive.org/wayback/available?url=${encodeURIComponent(imageUrl)}`,
      { signal: AbortSignal.timeout(30000) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      archived_snapshots?: { closest?: { available?: boolean; url?: string } };
    };
    const snap = data.archived_snapshots?.closest;
    if (!snap?.available || !snap.url) return null;
    // "if_" serves the original file rather than the Wayback HTML wrapper.
    return snap.url.replace(/\/(\d{14})\//, '/$1if_/');
  } catch {
    return null;
  }
}

async function acquire(recipe: RecipeRow): Promise<Downloaded | null> {
  const direct = await downloadImage(recipe.image_url, recipe.source_url);
  if (direct) return { ...direct, via: 'direct' };

  if (recipe.source_url) {
    const fresh = await rescrapeImageUrl(recipe.source_url);
    if (fresh && fresh !== recipe.image_url) {
      const scraped = await downloadImage(fresh, recipe.source_url);
      if (scraped) return { ...scraped, via: 'rescrape' };
    }
  }

  const snapshot = await waybackImageUrl(recipe.image_url);
  if (snapshot) {
    const archived = await downloadImage(snapshot, null);
    if (archived) return { ...archived, via: 'wayback' };
  }

  return null;
}

async function migrate(recipe: RecipeRow): Promise<{ ok: boolean; via?: string; error?: string }> {
  const img = await acquire(recipe);
  if (!img) return { ok: false, error: 'image unrecoverable' };

  if (DRY_RUN) return { ok: true, via: `${img.via} (dry-run, ${(img.bytes.byteLength / 1024).toFixed(0)} KB)` };

  const ext = img.contentType.split('/')[1]?.split('+')[0] || 'jpg';
  const path = `backfill-${recipe.id}.${ext}`;
  try {
    await withRetry(async () => {
      const { error } = await supabase.storage
        .from('recipe-images')
        .upload(path, img.bytes, { contentType: img.contentType, upsert: true });
      if (error) throw new Error(`upload: ${error.message}`);
    });

    const { data } = supabase.storage.from('recipe-images').getPublicUrl(path);
    await withRetry(async () => {
      const { error } = await supabase
        .from('recipes')
        .update({ image_url: data.publicUrl })
        .eq('id', recipe.id);
      if (error) throw new Error(`db update: ${error.message}`);
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  return { ok: true, via: img.via };
}

async function main() {
  const { data, error } = await supabase
    .from('recipes')
    .select('id, title, image_url, source_url')
    .not('image_url', 'is', null)
    .order('created_at', { ascending: true });
  if (error) {
    console.error(error);
    process.exit(1);
  }

  const rows = (data as RecipeRow[]).filter(
    (r) => r.image_url && !r.image_url.includes(supabaseHost),
  );
  console.log(`${data.length} recipes with images, ${rows.length} to migrate${DRY_RUN ? ' (DRY RUN)' : ''}\n`);

  let migrated = 0;
  const recovered: string[] = [];
  const failures: { title: string; error: string }[] = [];

  const CONCURRENCY = 2;
  let idx = 0;
  async function worker() {
    while (idx < rows.length) {
      const recipe = rows[idx++];
      const result = await migrate(recipe);
      if (result.ok) {
        migrated++;
        if (result.via && result.via !== 'direct') {
          recovered.push(`${recipe.title} (via ${result.via})`);
        }
        process.stdout.write('.');
      } else {
        failures.push({ title: recipe.title, error: result.error ?? 'unknown' });
        process.stdout.write('x');
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  console.log(`\n\nMigrated: ${migrated}/${rows.length}`);
  if (recovered.length) {
    console.log(`\nRecovered dead URLs (${recovered.length}):`);
    recovered.forEach((r) => console.log(`  ✓ ${r}`));
  }
  if (failures.length) {
    console.log(`\nFailed (${failures.length}):`);
    failures.forEach((f) => console.log(`  ✗ ${f.title} — ${f.error}`));
  }
}

main();

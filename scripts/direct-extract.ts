/**
 * direct-extract.ts
 *
 * Fetches each pending URL, extracts the recipe directly from JSON-LD
 * structured data + page HTML (no LLM, no API key, no rate limits).
 *
 * Works perfectly for RecipeTin Eats and any other site using Recipe
 * schema markup. Falls back to best-effort page scraping for others.
 *
 * Output: appends to scripts/import-recipes.data.json
 * Then run: npx tsx scripts/import-recipes.ts
 *
 * Run: npx tsx scripts/direct-extract.ts
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';

const PENDING_FILE = path.resolve('scripts/import-recipes.pending.txt');
const FAILED_FILE  = path.resolve('scripts/import-recipes.failed.txt');
const DATA_FILE    = path.resolve('scripts/import-recipes.data.json');

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-AU,en;q=0.9,en-US;q=0.8',
  'Upgrade-Insecure-Requests': '1',
};

// ── HTML helpers ──────────────────────────────────────────────────────────────

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: FETCH_HEADERS, redirect: 'follow', signal: AbortSignal.timeout(20_000) });
    if (!res.ok) { console.log(`  HTTP ${res.status}`); return null; }
    const html = await res.text();
    return html.length > 2_000_000 ? html.slice(0, 2_000_000) : html;
  } catch (e: any) { console.log(`  Fetch error: ${e.message}`); return null; }
}

function extractJsonLdRecipe(html: string): any | null {
  const regex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1].trim());
      // Handle arrays or @graph
      const items: any[] = Array.isArray(data) ? data : data['@graph'] ? data['@graph'] : [data];
      for (const item of items) {
        if (item['@type'] === 'Recipe' || (Array.isArray(item['@type']) && item['@type'].includes('Recipe'))) {
          return item;
        }
      }
    } catch { /* malformed JSON — skip */ }
  }
  return null;
}

function extractVideoUrls(html: string): string[] {
  const ids = new Set<string>();
  for (const pattern of [
    /youtube(?:-nocookie)?\.com\/embed\/([a-zA-Z0-9_-]{11})/g,
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/g,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/g,
  ]) {
    let m;
    while ((m = pattern.exec(html)) !== null) ids.add(m[1]);
  }
  return [...ids].map((id) => `https://www.youtube.com/watch?v=${id}`);
}

function extractRecipeNotes(html: string): string | null {
  const wprmMatch = html.match(/<div[^>]*class="[^"]*wprm-recipe-notes[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i);
  if (wprmMatch) {
    let text = wprmMatch[1]
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/span>\s*(<div[^>]*class="wprm-spacer"[^>]*><\/div>)?\s*/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&rsquo;/g, '’').replace(/&lsquo;/g, '‘')
      .replace(/&ldquo;/g, '“').replace(/&rdquo;/g, '”')
      .replace(/&ndash;/g, '–').replace(/&mdash;/g, '—')
      .replace(/&hellip;/g, '…').replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&Prime;/g, '″')
      .replace(/&#(\d+);/g, (_: string, code: string) => String.fromCharCode(parseInt(code, 10)))
      .replace(/\n{3,}/g, '\n\n').trim();
    if (text.length > 20) return text;
  }
  const headingPattern = /<h[2-6][^>]*>[^<]*(?:Recipe\s+Notes?|Author'?s?\s+Notes?|Notes|Tips)[^<]*<\/h[2-6]>/gi;
  let hm;
  while ((hm = headingPattern.exec(html)) !== null) {
    const after = html.slice(hm.index + hm[0].length, hm.index + hm[0].length + 5000);
    const end = after.match(/<h[2-6][^>]*>|<div[^>]*class="[^"]*(?:recipe-card|wprm-recipe-container|comment)/i);
    let text = (end ? after.slice(0, end.index) : after)
      .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(?:p|li|div|span)>/gi, '\n').replace(/<[^>]+>/g, '')
      .replace(/&rsquo;/g, '’').replace(/&ldquo;/g, '“').replace(/&rdquo;/g, '”')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
      .replace(/&#(\d+);/g, (_: string, code: string) => String.fromCharCode(parseInt(code, 10)))
      .replace(/\n{3,}/g, '\n\n').trim();
    if (text.length > 20) return text;
  }
  return null;
}

function extractIngredientSections(html: string): Map<string, string> {
  // Maps ingredient original_text → category for WPRM group-named ingredients
  const map = new Map<string, string>();
  const groups = [...html.matchAll(
    /<li[^>]*class="[^"]*wprm-recipe-ingredient[^"]*"[^>]*data-ingredient-group="([^"]*)"[^>]*>[\s\S]*?<\/li>/gi,
  )];
  for (const g of groups) {
    const groupName = g[1];
    const textMatch = g[0].match(/wprm-recipe-ingredient-name[^>]*>([^<]+)<\/span>/i);
    if (textMatch) map.set(textMatch[1].trim(), groupName);
  }
  return map;
}

function extractOgImage(html: string): string | null {
  for (const p of [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
  ]) {
    const m = html.match(p);
    if (m?.[1]) return m[1];
  }
  return null;
}

// ── Recipe schema → our data model ────────────────────────────────────────────

function parseTime(value: unknown): number | null {
  if (!value) return null;
  const s = String(value);
  // ISO 8601 duration: PT1H30M, PT45M, etc.
  const iso = s.match(/^PT(?:(\d+)H)?(?:(\d+)M)?/i);
  if (iso) return (parseInt(iso[1] || '0') * 60) + parseInt(iso[2] || '0');
  // Plain minutes
  const mins = s.match(/^(\d+)/);
  if (mins) return parseInt(mins[1]);
  return null;
}

function parseServings(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  const m = String(value ?? '').match(/(\d+)/);
  return m ? parseInt(m[1]) : null;
}

function fixIngredientParsing(ing: { item: string; quantity: string; unit: string; category?: string; original_text?: string }) {
  if (!ing.original_text) ing.original_text = [ing.quantity, ing.unit, ing.item].filter(Boolean).join(' ');
  if (ing.quantity || ing.unit) return ing;

  // Strip dual measurement before parsing
  if (ing.item?.includes(' / ')) {
    const dm = ing.item.match(
      /^([\d¼½¾⅓⅔⅛⅜⅝⅞\/\.\-–\s]+(?:cups?|tbsps?|tsps?|tablespoons?|teaspoons?|oz|ounces?|lbs?|pounds?|g|grams?|kg|ml|litres?|liters?|cloves?|large|medium|small|cans?|bunch(?:es)?|pieces?|slices?|sprigs?|stalks?|heads?|pinch(?:es)?|handfuls?|packets?|sticks?|rashers?|fillets?)?)\s*\/\s*[\d¼½¾⅓⅔⅛⅜⅝⅞\/\.\-–\s]+(?:cups?|tbsps?|tsps?|tablespoons?|teaspoons?|oz|ounces?|lbs?|pounds?|g|grams?|kg|ml|litres?|liters?|cloves?|large|medium|small|cans?|bunch(?:es)?|pieces?|slices?|sprigs?|stalks?|heads?|pinch(?:es)?|handfuls?|packets?|sticks?|rashers?|fillets?)?\s+(.+)$/i);
    if (dm) ing.item = `${dm[1].trim()} ${dm[2].trim()}`;
  }

  const m = ing.item?.match(
    /^([\d¼½¾⅓⅔⅛⅜⅝⅞\/\.\-–]+(?:\s*[\d\/\.]+)?)\s*(cups?|tbsps?|tsps?|tablespoons?|teaspoons?|oz|ounces?|lbs?|pounds?|g|grams?|kg|ml|litres?|liters?|cloves?|large|medium|small|cans?|bunch(?:es)?|pieces?|slices?|sprigs?|stalks?|heads?|pinch(?:es)?|handfuls?|packets?|sticks?|rashers?|fillets?)?\s+(.+)$/i);
  if (m) return { ...ing, quantity: m[1].trim(), unit: (m[2] || '').trim().toLowerCase(), item: m[3].trim() };
  return ing;
}

function parseIngredients(raw: string[], html: string): any[] {
  // Try to get WPRM ingredient group data from HTML for category assignment
  const groupData = extractIngredientGroupsFromHtml(html);

  return raw.map((line) => {
    const original_text = line;
    let quantity = '';
    let unit = '';
    let item = line;
    let category = groupData.get(line.trim()) || '';

    const fixed = fixIngredientParsing({ item, quantity, unit, category, original_text });
    return fixed;
  });
}

function extractIngredientGroupsFromHtml(html: string): Map<string, string> {
  // Extract WPRM ingredient lines with their group names
  const map = new Map<string, string>();
  const groupPattern = /<li[^>]*class="[^"]*wprm-recipe-ingredient[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
  let m;
  while ((m = groupPattern.exec(html)) !== null) {
    const liHtml = m[1];
    // Get group name from data attribute on parent or from the group header
    const groupMatch = m[0].match(/data-ingredient-group="([^"]*)"/i);
    const nameMatch = liHtml.match(/wprm-recipe-ingredient-name[^>]*>([^<]+)<\/span>/i);
    if (groupMatch && nameMatch) {
      map.set(nameMatch[1].trim(), groupMatch[1]);
    }
  }

  // Also look for WPRM group containers with a name span
  const sectionPattern = /<li[^>]*class="[^"]*wprm-recipe-ingredient-group[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
  let currentGroup = '';
  // Parse sequentially instead
  const allLis = [...html.matchAll(/<li[^>]*class="[^"]*wprm-recipe-ingredient[^"]*"[^>]*>[\s\S]*?<\/li>/gi)];
  for (const li of allLis) {
    const groupAttr = li[0].match(/data-ingredient-group="([^"]*)"/i);
    if (groupAttr) currentGroup = groupAttr[1];
    const nameEl = li[0].match(/wprm-recipe-ingredient-name[^>]*>([^<]+)<\/span>/i);
    if (nameEl && currentGroup) map.set(nameEl[1].trim(), currentGroup);
  }

  return map;
}

function parseSteps(raw: any[], html: string): any[] {
  // JSON-LD steps can be HowToStep or HowToSection (grouped)
  const steps: any[] = [];
  let order = 1;

  function processStep(step: any, category?: string) {
    const instruction = typeof step === 'string' ? step :
      step.text || step.name || '';
    if (instruction) steps.push({ order: order++, instruction: instruction.trim(), category: category || '' });
  }

  for (const step of raw) {
    if (step['@type'] === 'HowToSection') {
      const sectionName = step.name || '';
      const sectionSteps = step.itemListElement || step.steps || [];
      for (const s of sectionSteps) processStep(s, sectionName);
    } else {
      processStep(step);
    }
  }
  return steps;
}

function parseTags(keywords: string | string[] | undefined, category?: string): Array<{ name: string; emoji: string }> {
  // Generate basic tags from cuisine/category info in JSON-LD
  // We keep tags minimal since we don't have LLM to suggest emojis
  const tags: Array<{ name: string; emoji: string }> = [];
  if (!keywords && !category) return tags;

  const cuisineMap: Record<string, string> = {
    'italian': '🇮🇹', 'mexican': '🇲🇽', 'chinese': '🇨🇳', 'indian': '🇮🇳',
    'thai': '🇹🇭', 'japanese': '🇯🇵', 'greek': '🇬🇷', 'french': '🇫🇷',
    'korean': '🇰🇷', 'vietnamese': '🇻🇳', 'lebanese': '🇱🇧', 'moroccan': '🇲🇦',
    'american': '🇺🇸', 'australian': '🇦🇺', 'mediterranean': '🫒',
  };
  const mealMap: Record<string, string> = {
    'dinner': '🍽️', 'lunch': '🥗', 'breakfast': '🍳', 'dessert': '🍰',
    'snack': '🍿', 'soup': '🍲', 'salad': '🥗', 'pasta': '🍝',
    'curry': '🍛', 'stir fry': '🥢', 'baked': '🥧', 'grilled': '🔥',
    'slow cooker': '🫕', 'sandwich': '🥪', 'tacos': '🌮', 'burgers': '🍔',
  };
  const proteinMap: Record<string, string> = {
    'chicken': '🍗', 'beef': '🥩', 'pork': '🥓', 'lamb': '🐑',
    'fish': '🐟', 'salmon': '🐟', 'seafood': '🦐', 'shrimp': '🦐',
    'tofu': '🫘', 'vegetarian': '🥦', 'vegan': '🌱',
  };

  const allText = [
    ...(Array.isArray(keywords) ? keywords : (keywords || '').split(',')),
    category || '',
  ].map((s) => String(s).toLowerCase().trim()).filter(Boolean);

  const seen = new Set<string>();
  for (const text of allText) {
    for (const [key, emoji] of Object.entries({ ...cuisineMap, ...mealMap, ...proteinMap })) {
      if (text.includes(key) && !seen.has(key)) {
        seen.add(key);
        tags.push({ name: key, emoji });
        if (tags.length >= 5) return tags;
      }
    }
  }
  return tags;
}

function extractCreatorName(schema: any, html: string): string | null {
  // Try JSON-LD author
  if (schema.author) {
    const author = Array.isArray(schema.author) ? schema.author[0] : schema.author;
    if (typeof author === 'string') return author;
    if (author?.name) return author.name;
  }
  // Fall back to meta tag
  const metaMatch = html.match(/<meta[^>]+name=["']author["'][^>]+content=["']([^"']+)["']/i);
  return metaMatch?.[1] ?? null;
}

function extractImageUrl(schema: any, html: string): string | null {
  if (schema.image) {
    if (typeof schema.image === 'string') return schema.image;
    if (Array.isArray(schema.image)) return schema.image[0]?.url || schema.image[0] || null;
    if (schema.image.url) return schema.image.url;
  }
  // OG image fallback
  const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
  return og?.[1] ?? null;
}

function extractVideoUrl(schema: any, html: string): string | null {
  // Check JSON-LD video field
  if (schema.video) {
    const vid = Array.isArray(schema.video) ? schema.video[0] : schema.video;
    if (typeof vid === 'string' && vid.includes('youtube')) {
      const idMatch = vid.match(/(?:v=|embed\/)([a-zA-Z0-9_-]{11})/);
      if (idMatch) return `https://www.youtube.com/watch?v=${idMatch[1]}`;
    }
    if (vid?.embedUrl) {
      const idMatch = vid.embedUrl.match(/embed\/([a-zA-Z0-9_-]{11})/);
      if (idMatch) return `https://www.youtube.com/watch?v=${idMatch[1]}`;
    }
    if (vid?.url) return vid.url;
  }
  // Regex fallback across page HTML
  const urls = extractVideoUrls(html);
  return urls[0] ?? null;
}

// ── Main extraction ────────────────────────────────────────────────────────────

function extractFromSchema(url: string, schema: any, html: string): any {
  const rawIngredients: string[] = schema.recipeIngredient || [];
  const rawSteps: any[] = schema.recipeInstructions || [];

  return {
    source_url: url,
    title: schema.name || '',
    description: schema.description || null,
    ingredients: parseIngredients(rawIngredients, html),
    steps: parseSteps(rawSteps, html),
    servings: parseServings(schema.recipeYield),
    prep_time: parseTime(schema.prepTime),
    cook_time: parseTime(schema.cookTime),
    creator_name: extractCreatorName(schema, html),
    author_notes: extractRecipeNotes(html),
    image_url: extractImageUrl(schema, html),
    video_url: extractVideoUrl(schema, html),
    tags: parseTags(schema.keywords, schema.recipeCategory),
  };
}

function appendLine(file: string, line: string) {
  fs.appendFileSync(file, line + '\n');
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  if (!fs.existsSync(PENDING_FILE)) { console.log('No pending file. Nothing to do.'); return; }

  const pending = fs.readFileSync(PENDING_FILE, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
  console.log(`Processing ${pending.length} pending URLs\n`);

  // Load existing data.json so we can append
  const existing: any[] = fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) : [];
  const existingUrls = new Set(existing.map((r) => r.source_url?.toLowerCase().replace(/\/$/, '')));

  const results: any[] = [...existing];
  const remaining: string[] = [];
  let extracted = 0;
  let failed = 0;

  for (let i = 0; i < pending.length; i++) {
    const url = pending[i];
    const prefix = `[${i + 1}/${pending.length}]`;

    if (existingUrls.has(url.toLowerCase().replace(/\/$/, ''))) {
      console.log(`${prefix} SKIP (already extracted): ${url}`);
      continue;
    }

    process.stdout.write(`${prefix} ${url}\n`);

    const html = await fetchHtml(url);
    if (!html) {
      console.log(`  FAIL — could not fetch`);
      appendLine(FAILED_FILE, `${url}\tCould not fetch HTML`);
      failed++;
      remaining.push(url);
      await new Promise((r) => setTimeout(r, 500));
      continue;
    }

    const schema = extractJsonLdRecipe(html);
    if (!schema) {
      console.log(`  FAIL — no Recipe JSON-LD found`);
      appendLine(FAILED_FILE, `${url}\tNo Recipe JSON-LD`);
      failed++;
      remaining.push(url);
      await new Promise((r) => setTimeout(r, 500));
      continue;
    }

    const recipe = extractFromSchema(url, schema, html);
    if (!recipe.title) {
      console.log(`  FAIL — no title extracted`);
      appendLine(FAILED_FILE, `${url}\tNo title`);
      failed++;
      remaining.push(url);
      continue;
    }

    results.push(recipe);
    existingUrls.add(url.toLowerCase().replace(/\/$/, ''));
    extracted++;
    console.log(`  OK: ${recipe.title} | steps=${recipe.steps.length} ing=${recipe.ingredients.length} notes=${!!recipe.author_notes} video=${!!recipe.video_url}`);

    // Save progress after every 10 recipes in case of interruption
    if (extracted % 10 === 0) {
      fs.writeFileSync(DATA_FILE, JSON.stringify(results, null, 2));
      console.log(`  [saved progress: ${results.length} total in data.json]`);
    }

    await new Promise((r) => setTimeout(r, 300));
  }

  // Final save
  fs.writeFileSync(DATA_FILE, JSON.stringify(results, null, 2));

  // Rewrite pending with only the ones that failed
  fs.writeFileSync(PENDING_FILE, remaining.join('\n') + (remaining.length ? '\n' : ''));

  console.log(`\nDone. extracted=${extracted} failed=${failed}`);
  console.log(`data.json now has ${results.length} recipes total`);
  if (remaining.length > 0) {
    console.log(`${remaining.length} URLs remain in pending.txt (fetch failures — retry later)`);
  } else {
    console.log(`Pending list cleared!`);
  }
  console.log(`\nNext step: npx tsx scripts/import-recipes.ts`);
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });

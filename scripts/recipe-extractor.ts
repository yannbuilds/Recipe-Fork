/**
 * recipe-extractor.ts
 *
 * Shared extraction module used by batch-import.ts and patch-recipe-metadata.ts.
 *
 * Mirrors the import-recipe Supabase edge function exactly, but calls the
 * Anthropic API (Claude) directly instead of Groq — no edge function needed,
 * no Supabase round-trip, no daily token cap.
 *
 * Requires: ANTHROPIC_API_KEY in .env
 * Model: claude-haiku-4-5 — fast, cheap, excellent at structured JSON extraction
 */

import Anthropic from '@anthropic-ai/sdk';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = 'claude-haiku-4-5';

const SYSTEM_PROMPT = `You are a recipe extraction assistant. Given the HTML of a web page, extract the recipe data and return it as JSON.

Return ONLY a JSON object with this exact structure:
{
  "title": "Recipe title",
  "description": "Brief description or null",
  "ingredients": [
    { "original_text": "full ingredient line exactly as written on the page", "item": "ingredient name", "quantity": "amount as string", "unit": "unit of measurement", "category": "optional grouping" }
  ],
  "steps": [
    { "order": 1, "instruction": "step instruction", "category": "optional grouping" }
  ],
  "servings": null or integer (if the recipe says "2-4 servings", use the lower number e.g. 2),
  "prep_time": null or number in minutes,
  "cook_time": null or number in minutes,
  "image_url": "full image URL or null",
  "video_url": "full video URL or null",
  "creator_name": "recipe author/creator name or null",
  "tags": [{"name": "tag1", "emoji": "🍽️"}, {"name": "tag2", "emoji": "🍗"}],
  "author_notes": "verbatim recipe notes from the author, or null"
}

Example ingredient parsing — JSON-LD "recipeIngredient" contains flat strings. You MUST parse each into separate fields:
- "1 cup all-purpose flour" → { "original_text": "1 cup all-purpose flour", "item": "all-purpose flour", "quantity": "1", "unit": "cup", "category": "" }
- "2 large eggs" → { "original_text": "2 large eggs", "item": "eggs", "quantity": "2", "unit": "large", "category": "" }
- "1/2 tsp salt" → { "original_text": "1/2 tsp salt", "item": "salt", "quantity": "1/2", "unit": "tsp", "category": "" }
- "2-3 cloves garlic, minced" → { "original_text": "2-3 cloves garlic, minced", "item": "garlic, minced", "quantity": "2-3", "unit": "cloves", "category": "" }
- "Fresh cilantro for garnish" → { "original_text": "Fresh cilantro for garnish", "item": "fresh cilantro for garnish", "quantity": "", "unit": "", "category": "" }
- "400g canned tomatoes" → { "original_text": "400g canned tomatoes", "item": "canned tomatoes", "quantity": "400", "unit": "g", "category": "" }
- "1.75 – 2 kg / 3.5 – 4lb whole chicken, patted dry" → { "original_text": "1.75 – 2 kg / 3.5 – 4lb whole chicken, patted dry", "item": "whole chicken, patted dry", "quantity": "1.75 – 2", "unit": "kg", "category": "" }
- "100 g / 1 stick unsalted butter, melted" → { "original_text": "100 g / 1 stick unsalted butter, melted", "item": "unsalted butter, melted", "quantity": "100", "unit": "g", "category": "" }
- "1 cup / 250 ml dry white wine" → { "original_text": "1 cup / 250 ml dry white wine", "item": "dry white wine", "quantity": "1", "unit": "cup", "category": "" }

Rules:
- Extract ALL ingredients and ALL steps from the recipe.
- "original_text" MUST be the full ingredient line exactly as it appears on the page, with no modifications. Include fractions, parenthetical conversions, preparation notes, annotations, and qualifiers verbatim. For example: "2/3 cup (150 ml) yoghurt, plain" or "750g (1.5 lb) chicken thighs, skin on, bone in, halved along bone (Note 1)". Do NOT paraphrase or restructure.
- When an ingredient has two measurements separated by "/" (e.g. "100 g / 1 stick unsalted butter" or "1 cup / 250 ml wine"), use ONLY the first measurement for "quantity" and "unit". Never mix numbers or units from different sides of the "/". The full dual-measurement text is preserved verbatim in "original_text".
- IMPORTANT — Ingredient parsing: JSON-LD "recipeIngredient" contains flat strings like "1 cup flour". You MUST parse each string into separate fields: extract the leading number(s) as "quantity", the unit word as "unit", and the remaining text as "item". Do NOT put the full string into "item" with empty quantity/unit. "quantity" should be a string (e.g. "1/2", "2-3"). "unit" should be standardised (e.g. "cup", "tbsp", "g"). If no unit, use an empty string.
- For steps: number them sequentially starting at 1. Keep the full instruction text.
- IMPORTANT — Categories: If ingredients or steps are grouped into sections, you MUST set the "category" field for each item in that group.
  - For steps: if JSON-LD contains "HowToSection" objects, use the section "name" as the category (e.g. "Par Boiled Rice", "Crispy Onions"). If page text has section headings before steps, use those.
  - For ingredients: JSON-LD usually lists ingredients flat without groups. Check the page text for section headings (e.g. "Marinade", "For the sauce", "Rice", "Garnish") that separate ingredient lists, and assign those as categories.
  - Strip trailing colons from category names (e.g. "Marinade:" → "Marinade").
- Times should be in minutes (convert hours to minutes).
- Look for structured data (JSON-LD) first, then fall back to page content.
- For video_url: check the "[Video URLs found on page]" section first — if present, use the first URL. Also check JSON-LD "video" field. Return a full YouTube watch URL (https://www.youtube.com/watch?v=...) or null if no video exists.
- For tags: suggest 3–5 tags as objects with "name" (lowercase) and "emoji" (a single emoji that represents the tag). Only use tags that help filter recipes by: cuisine (e.g. "indian", "italian", "mexican", "chinese"), protein (e.g. "chicken", "beef", "fish", "tofu"), meal type (e.g. "dinner", "breakfast", "dessert", "snack"), or dietary restriction (e.g. "vegetarian", "vegan", "gluten-free"). Do NOT include generic adjectives like "easy", "quick", "healthy", "moist", "delicious", or ingredient names that aren't the main protein.
- For creator_name: extract the recipe author/creator name. Check JSON-LD "author.name", byline elements, or meta tags. Return the name as-is (e.g. "Nagi | RecipeTin Eats"). Return null if not found.
- For author_notes: look for a "Recipe Notes", "Notes", "Tips", or similar section on the page that contains the author's tips, substitutions, or commentary about the recipe. Copy the full text verbatim as a single string, preserving numbered lists and line breaks (use "\\n" for newlines). Do NOT include the section heading itself. Return null if no notes section exists.
- If you cannot find a recipe on the page, return: { "error": "No recipe found on this page" }`;

// ── HTML extraction helpers (ported from edge function) ───────────────────────

function extractJsonLd(html: string): string | null {
  const regex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    if (match[1].includes('Recipe')) return match[1].trim();
  }
  return null;
}

function extractMainText(html: string): string {
  let text = html;
  for (const tag of ['script', 'style', 'svg', 'noscript', 'nav', 'footer', 'header', 'aside', 'iframe', 'form']) {
    text = text.replace(new RegExp(`<${tag}[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi'), ' ');
  }
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
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

function extractIngredientSections(html: string): string | null {
  const parts: string[] = [];
  for (const m of html.matchAll(/<span[^>]*class="[^"]*wprm-recipe-group-name[^"]*"[^>]*>([^<]+)<\/span>/gi)) {
    const text = m[1].replace(/:$/, '').trim();
    if (text && text.length < 60) parts.push(`\n--- ${text} ---`);
  }
  if (parts.length === 0) {
    const headingPattern = /<h[2-4][^>]*>([^<]+)<\/h[2-4]>/gi;
    const lines = html.split('\n');
    let inIngredientSection = false;
    for (const line of lines) {
      if (/class="[^"]*ingredient/i.test(line)) inIngredientSection = true;
      else if (inIngredientSection && /class="[^"]*(?:instruction|step|direction|method)/i.test(line)) inIngredientSection = false;
      if (inIngredientSection) {
        let hMatch;
        while ((hMatch = headingPattern.exec(line)) !== null) {
          const text = hMatch[1].replace(/:$/, '').trim();
          if (text && text.length < 60 && !/^\d/.test(text)) parts.push(`\n--- ${text} ---`);
        }
      }
    }
  }
  return parts.length > 0 ? parts.join('\n') : null;
}

function extractRecipeNotes(html: string): string | null {
  const wprmMatch = html.match(/<div[^>]*class="[^"]*wprm-recipe-notes[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i);
  if (wprmMatch) {
    let text = wprmMatch[1]
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/span>\s*(<div[^>]*class="wprm-spacer"[^>]*><\/div>)?\s*/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&rsquo;/g, '’').replace(/&ldquo;/g, '“').replace(/&rdquo;/g, '”')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
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
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
      .replace(/\n{3,}/g, '\n\n').trim();
    if (text.length > 20) return text;
  }
  return null;
}

function extractOgImage(html: string): string | null {
  for (const pattern of [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
  ]) {
    const m = html.match(pattern);
    if (m?.[1]) return m[1];
  }
  return null;
}

function buildLlmPayload(html: string): string {
  const jsonLd = extractJsonLd(html);
  const videoUrls = extractVideoUrls(html);
  const ingredientSections = extractIngredientSections(html);
  const videoBlock = videoUrls.length > 0 ? `\n\n[Video URLs found on page]:\n${videoUrls.join('\n')}` : '';
  const sectionsBlock = ingredientSections ? `\n\n[Ingredient sections from page (with group headings)]:\n${ingredientSections}` : '';

  if (jsonLd) {
    return `[JSON-LD structured data]:\n${jsonLd}\n\n[Page text (excerpt)]:\n${extractMainText(html).slice(0, 8000)}${sectionsBlock}${videoBlock}`;
  }
  return extractMainText(html).slice(0, 12000) + sectionsBlock + videoBlock;
}

function fixIngredientParsing(ingredients: Array<{ item: string; quantity: string; unit: string; category?: string; original_text?: string }>) {
  return ingredients.map((ing) => {
    if (!ing.original_text) {
      ing.original_text = [ing.quantity, ing.unit, ing.item].filter(Boolean).join(' ');
    }
    if (ing.quantity || ing.unit) return ing;
    if (ing.item?.includes(' / ')) {
      const dm = ing.item.match(/^([\d¼-¾⅐-⅞\/\.\-–\s]+(?:cups?|tbsps?|tsps?|tablespoons?|teaspoons?|oz|ounces?|lbs?|pounds?|g|grams?|kg|ml|litres?|liters?|cloves?|large|medium|small|cans?|bunch(?:es)?|pieces?|slices?|sprigs?|stalks?|heads?|pinch(?:es)?|handfuls?|packets?|sticks?|rashers?|fillets?)?)\s*\/\s*[\d¼-¾⅐-⅞\/\.\-–\s]+(?:cups?|tbsps?|tsps?|tablespoons?|teaspoons?|oz|ounces?|lbs?|pounds?|g|grams?|kg|ml|litres?|liters?|cloves?|large|medium|small|cans?|bunch(?:es)?|pieces?|slices?|sprigs?|stalks?|heads?|pinch(?:es)?|handfuls?|packets?|sticks?|rashers?|fillets?)?\s+(.+)$/i);
      if (dm) ing.item = `${dm[1].trim()} ${dm[2].trim()}`;
    }
    const m = ing.item?.match(/^([\d¼-¾⅐-⅞\/\.\-–]+(?:\s*[\d\/\.]+)?)\s*(cups?|tbsps?|tsps?|tablespoons?|teaspoons?|oz|ounces?|lbs?|pounds?|g|grams?|kg|ml|litres?|liters?|cloves?|large|medium|small|cans?|bunch(?:es)?|pieces?|slices?|sprigs?|stalks?|heads?|pinch(?:es)?|handfuls?|packets?|sticks?|rashers?|fillets?)?\s+(.+)$/i);
    if (m) return { ...ing, quantity: m[1].trim(), unit: (m[2] || '').trim().toLowerCase(), item: m[3].trim() };
    return ing;
  });
}

function parseServings(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  if (typeof value === 'string') { const m = value.match(/(\d+)/); if (m) return parseInt(m[1], 10); }
  return null;
}

// ── Main export ────────────────────────────────────────────────────────────────

export interface ExtractedRecipe {
  title: string;
  description: string | null;
  ingredients: any[];
  steps: any[];
  source_url: string;
  creator_name: string | null;
  author_notes: string | null;
  image_url: string | null;
  video_url: string | null;
  servings: number | null;
  prep_time: number | null;
  cook_time: number | null;
}

export interface ExtractionResult {
  recipe: ExtractedRecipe;
  tags: Array<{ name: string; emoji: string }>;
}

/**
 * Extract a recipe from a URL + HTML using Claude.
 *
 * Pass html when you've already fetched the page (preferred — avoids a second
 * fetch and mirrors the Chrome extension's approach). If html is null, Claude
 * still gets the URL context but won't have page content — caller should log a warning.
 */
export async function extractRecipeWithClaude(
  url: string,
  html: string,
): Promise<ExtractionResult | { error: string }> {
  if (!ANTHROPIC_API_KEY) {
    return { error: 'ANTHROPIC_API_KEY not set in .env' };
  }

  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  const htmlExtractedNotes = extractRecipeNotes(html);
  const content = buildLlmPayload(html);

  if (content.length < 100) {
    return { error: 'No recipe content found on this page' };
  }

  let parsed: any;
  try {
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `Extract the recipe from this page:\n\n${content}` }],
    });

    const text = message.content[0].type === 'text' ? message.content[0].text : '';
    // Claude may wrap JSON in a code block — strip it
    const jsonText = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    parsed = JSON.parse(jsonText);
  } catch (e: any) {
    return { error: `Claude extraction failed: ${e.message}` };
  }

  if (parsed.error) return { error: parsed.error };

  const ingredients = fixIngredientParsing(parsed.ingredients ?? []);
  const recipe: ExtractedRecipe = {
    title: parsed.title,
    description: parsed.description ?? null,
    ingredients,
    steps: parsed.steps ?? [],
    source_url: url,
    creator_name: parsed.creator_name ?? null,
    author_notes: htmlExtractedNotes ?? parsed.author_notes ?? null,
    image_url: parsed.image_url ?? extractOgImage(html) ?? null,
    video_url: parsed.video_url ?? null,
    servings: parseServings(parsed.servings),
    prep_time: parseServings(parsed.prep_time),
    cook_time: parseServings(parsed.cook_time),
  };

  const rawTags = Array.isArray(parsed.tags) ? parsed.tags : [];
  const tags = rawTags
    .map((t: any) =>
      typeof t === 'string'
        ? { name: t.trim().toLowerCase(), emoji: '🏷️' }
        : { name: String(t.name ?? '').trim().toLowerCase(), emoji: String(t.emoji ?? '🏷️').trim() },
    )
    .filter((t: any) => t.name.length > 0 && t.name.length < 50);

  return { recipe, tags };
}

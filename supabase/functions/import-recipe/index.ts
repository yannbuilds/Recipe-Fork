import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "openai/gpt-oss-120b";

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

function parseServings(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value);
  }
  if (typeof value === "string") {
    const match = value.match(/(\d+)/);
    if (match) return parseInt(match[1], 10);
  }
  return null;
}

// --- HTML extraction helpers (server-side, regex-based) ---

function extractJsonLd(html: string): string | null {
  const regex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    if (match[1].includes("Recipe")) {
      return match[1].trim();
    }
  }
  return null;
}

/**
 * Parse raw JSON-LD and keep only the recipe fields we care about.
 * Sites like RecipeTinEats embed enormous JSON-LD (image arrays, nutrition,
 * dozens of reviews) where the instructions/timings/video can sit past any
 * char cap. Distilling to the useful fields keeps the payload tiny AND
 * guarantees the method, timings and video survive. Returns null if it can't
 * find a Recipe object (caller falls back to the raw blob).
 */
// deno-lint-ignore no-explicit-any
function distillJsonLd(raw: string): string | null {
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  // Flatten the possible shapes: single object, array, or { "@graph": [...] }.
  // deno-lint-ignore no-explicit-any
  const candidates: any[] = [];
  // deno-lint-ignore no-explicit-any
  const collect = (v: any) => {
    if (Array.isArray(v)) {
      v.forEach(collect);
    } else if (v && typeof v === "object") {
      if (Array.isArray(v["@graph"])) v["@graph"].forEach(collect);
      candidates.push(v);
    }
  };
  collect(parsed);

  // deno-lint-ignore no-explicit-any
  const isRecipe = (t: any) =>
    t === "Recipe" || (Array.isArray(t) && t.includes("Recipe"));
  const recipe = candidates.find((c) => isRecipe(c["@type"]));
  if (!recipe) return null;

  // deno-lint-ignore no-explicit-any
  const firstUrl = (v: any): string | undefined => {
    if (!v) return undefined;
    if (typeof v === "string") return v;
    if (Array.isArray(v)) return firstUrl(v[0]);
    if (typeof v === "object") return v.url || v.contentUrl || undefined;
    return undefined;
  };

  // Instructions come as strings, HowToStep objects, or HowToSection groups.
  // deno-lint-ignore no-explicit-any
  const flattenInstructions = (v: any): string[] => {
    if (!v) return [];
    if (typeof v === "string") return [v];
    if (Array.isArray(v)) return v.flatMap(flattenInstructions);
    if (typeof v === "object") {
      if (v["@type"] === "HowToSection") {
        const steps = flattenInstructions(v.itemListElement);
        return v.name ? [`[${v.name}]`, ...steps] : steps;
      }
      if (v.text) return [String(v.text)];
      if (v.name) return [String(v.name)];
    }
    return [];
  };

  let video = recipe.video;
  if (Array.isArray(video)) video = video[0];
  const videoUrl = video && typeof video === "object"
    ? (video.contentUrl || video.embedUrl || undefined)
    : (typeof video === "string" ? video : undefined);

  // deno-lint-ignore no-explicit-any
  const distilled: Record<string, any> = {
    name: recipe.name,
    description: typeof recipe.description === "string" ? recipe.description : undefined,
    image: firstUrl(recipe.image),
    prepTime: recipe.prepTime,
    cookTime: recipe.cookTime,
    totalTime: recipe.totalTime,
    recipeYield: recipe.recipeYield,
    recipeCategory: recipe.recipeCategory,
    recipeCuisine: recipe.recipeCuisine,
    keywords: recipe.keywords,
    recipeIngredient: recipe.recipeIngredient,
    recipeInstructions: flattenInstructions(recipe.recipeInstructions),
    video: videoUrl,
  };

  // Drop empty keys so the blob stays tight.
  for (const k of Object.keys(distilled)) {
    const val = distilled[k];
    if (
      val === undefined || val === null || val === "" ||
      (Array.isArray(val) && val.length === 0)
    ) {
      delete distilled[k];
    }
  }

  return JSON.stringify(distilled);
}

function extractMainText(html: string): string {
  let text = html;
  // Remove unwanted elements and their contents
  const tagsToRemove = [
    "script", "style", "svg", "noscript", "nav", "footer",
    "header", "aside", "iframe", "form",
  ];
  for (const tag of tagsToRemove) {
    const re = new RegExp(`<${tag}[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi");
    text = text.replace(re, " ");
  }
  // Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, " ");
  // Decode common HTML entities
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
  // Collapse whitespace
  text = text.replace(/\s+/g, " ").trim();
  return text;
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

/**
 * Extract ingredient section headings from raw HTML using regex.
 * Gives the LLM category/grouping context that JSON-LD lacks.
 * Uses simple, non-backtracking patterns safe for edge runtimes.
 */
function extractIngredientSections(html: string): string | null {
  const parts: string[] = [];

  // WPRM group names (WordPress Recipe Maker)
  const groupNames = html.matchAll(
    /<span[^>]*class="[^"]*wprm-recipe-group-name[^"]*"[^>]*>([^<]+)<\/span>/gi,
  );
  for (const m of groupNames) {
    const text = m[1].replace(/:$/, "").trim();
    if (text && text.length < 60) {
      parts.push(`\n--- ${text} ---`);
    }
  }

  // If no WPRM groups, look for headings inside ingredient-related containers
  if (parts.length === 0) {
    // Find h2–h4 headings that appear near ingredient-related class names
    const headingPattern = /<h[2-4][^>]*>([^<]+)<\/h[2-4]>/gi;
    const lines = html.split("\n");
    let inIngredientSection = false;
    for (const line of lines) {
      if (/class="[^"]*ingredient/i.test(line)) {
        inIngredientSection = true;
      } else if (inIngredientSection && /class="[^"]*(?:instruction|step|direction|method)/i.test(line)) {
        inIngredientSection = false;
      }
      if (inIngredientSection) {
        let hMatch;
        while ((hMatch = headingPattern.exec(line)) !== null) {
          const text = hMatch[1].replace(/:$/, "").trim();
          if (text && text.length < 60 && !/^\d/.test(text)) {
            parts.push(`\n--- ${text} ---`);
          }
        }
      }
    }
  }

  return parts.length > 0 ? parts.join("\n") : null;
}

/**
 * Extract recipe notes/tips directly from page HTML.
 * Targets WPRM (WordPress Recipe Maker) notes containers first,
 * then falls back to generic heading-based extraction.
 */
function extractRecipeNotes(html: string): string | null {
  // 1. WPRM notes container (most common recipe plugin)
  const wprmMatch = html.match(
    /<div[^>]*class="[^"]*wprm-recipe-notes"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i,
  );
  if (wprmMatch) {
    let text = wprmMatch[1];
    // Convert <span> blocks and <br> to newlines
    text = text.replace(/<br\s*\/?>/gi, "\n");
    text = text.replace(/<\/span>\s*(<div[^>]*class="wprm-spacer"[^>]*><\/div>)?\s*/gi, "\n");
    text = text.replace(/<[^>]+>/g, ""); // strip remaining tags
    text = text.replace(/&rsquo;/g, "\u2019").replace(/&ldquo;/g, "\u201C").replace(/&rdquo;/g, "\u201D");
    text = text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
    text = text.replace(/\n{3,}/g, "\n\n").trim();
    if (text.length > 20) return text;
  }

  // 2. Generic: find a section headed "Notes", "Recipe Notes", "Tips", "Author's Notes"
  const headingPattern = /<h[2-6][^>]*>[^<]*(?:Recipe\s+Notes?|Author'?s?\s+Notes?|Notes|Tips)[^<]*<\/h[2-6]>/gi;
  let headingMatch;
  while ((headingMatch = headingPattern.exec(html)) !== null) {
    // Grab content after the heading until the next heading or major section
    const afterHeading = html.slice(headingMatch.index + headingMatch[0].length, headingMatch.index + headingMatch[0].length + 5000);
    const endMatch = afterHeading.match(/<h[2-6][^>]*>|<div[^>]*class="[^"]*(?:recipe-card|wprm-recipe-container|comment)/i);
    const content = endMatch ? afterHeading.slice(0, endMatch.index) : afterHeading;

    // Strip HTML tags and clean up
    let text = content
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|li|div|span)>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&rsquo;/g, "\u2019").replace(/&ldquo;/g, "\u201C").replace(/&rdquo;/g, "\u201D")
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (text.length > 20) return text;
  }

  return null;
}

/**
 * Pull the first usable image URL out of a JSON-LD "image" value, which may be
 * a string, an array, or an ImageObject ({ url: ... }) — and any nesting of
 * those. Returns null if nothing string-like is found.
 */
function firstImageUrl(image: unknown): string | null {
  if (typeof image === "string") {
    return image.trim() || null;
  }
  if (Array.isArray(image)) {
    for (const item of image) {
      const url = firstImageUrl(item);
      if (url) return url;
    }
    return null;
  }
  if (image && typeof image === "object") {
    return firstImageUrl((image as Record<string, unknown>).url);
  }
  return null;
}

/**
 * Extract the recipe's hero image from JSON-LD.
 *
 * Sites like marionskitchen.com show the main photo in a JS carousel, so it is
 * not reliably in og:image and the LLM often misses it — but WordPress Recipe
 * Maker (and most recipe plugins) always put the canonical image in the
 * Recipe node's "image" field. Handles @graph wrappers and @type arrays.
 */
function extractRecipeImageFromJsonLd(html: string): string | null {
  const raw = extractJsonLd(html);
  if (!raw) return null;

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }

  const isRecipe = (type: unknown): boolean =>
    type === "Recipe" || (Array.isArray(type) && type.includes("Recipe"));

  const findRecipe = (node: unknown): Record<string, unknown> | null => {
    if (Array.isArray(node)) {
      for (const item of node) {
        const found = findRecipe(item);
        if (found) return found;
      }
      return null;
    }
    if (node && typeof node === "object") {
      const obj = node as Record<string, unknown>;
      if (isRecipe(obj["@type"])) return obj;
      const graph = obj["@graph"];
      if (Array.isArray(graph)) return findRecipe(graph);
    }
    return null;
  };

  const recipe = findRecipe(data);
  return recipe ? firstImageUrl(recipe["image"]) : null;
}

/**
 * Extract image URL from Open Graph or Twitter meta tags as a fallback
 * when the LLM can't find an image in the page content.
 */
function extractOgImage(html: string): string | null {
  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

/**
 * Map of unicode fraction glyphs to their ASCII "a/b" equivalents.
 */
const UNICODE_FRACTIONS: Record<string, string> = {
  "¼": "1/4", "½": "1/2", "¾": "3/4",
  "⅐": "1/7", "⅑": "1/9", "⅒": "1/10",
  "⅓": "1/3", "⅔": "2/3",
  "⅕": "1/5", "⅖": "2/5", "⅗": "3/5", "⅘": "4/5",
  "⅙": "1/6", "⅚": "5/6",
  "⅛": "1/8", "⅜": "3/8", "⅝": "5/8", "⅞": "7/8",
};

/**
 * Convert unicode fraction glyphs to ASCII so downstream parsing doesn't drop
 * them. Handles mixed numbers where a whole number is fused to a fraction
 * glyph with no space (e.g. "2½ cups" -> "2 1/2 cups") as well as
 * standalone fractions ("⅔ cup" -> "2/3 cup"). Without this the LLM tends
 * to read "2½" as just "2", silently losing the half.
 */
function normaliseUnicodeFractions(text: string): string {
  const glyphs = Object.keys(UNICODE_FRACTIONS).join("");
  const re = new RegExp(`(\\d)?([${glyphs}])`, "g");
  return text.replace(re, (_m, whole: string | undefined, frac: string) => {
    const ascii = UNICODE_FRACTIONS[frac];
    return whole ? `${whole} ${ascii}` : ascii;
  });
}

// Groq's free tier caps input+output at 8K tokens/min. The system prompt is
// ~1.5K tokens, so we hold the page payload to ~12K chars (~3.5K tokens) and
// leave the rest for the model's JSON reply. This is a TOTAL cap: clean
// structured data (JSON-LD, ingredient groups, video links) goes first and the
// raw page-text excerpt fills whatever budget is left, so the cap only ever
// trims low-value filler (footer/nav/comments), never the recipe itself.
const MAX_PAYLOAD_CHARS = 12000;

function buildLlmPayload(html: string, url: string): string {
  const jsonLd = extractJsonLd(html);
  const videoUrls = extractVideoUrls(html);
  const ingredientSections = extractIngredientSections(html);
  const text = extractMainText(html);

  const videoSection =
    videoUrls.length > 0
      ? `\n\n[Video URLs found on page]:\n${videoUrls.join("\n")}`
      : "";
  const ingredientSectionBlock = ingredientSections
    ? `\n\n[Ingredient sections from page (with group headings)]:\n${ingredientSections}`
    : "";
  // Distil JSON-LD to just the recipe fields (keeps method/timings/video, drops
  // review/nutrition bloat). Fall back to a truncated raw blob if it won't parse.
  const distilledJsonLd = jsonLd ? distillJsonLd(jsonLd) : null;
  const jsonLdBlock = distilledJsonLd
    ? `[JSON-LD structured data]:\n${distilledJsonLd}`
    : jsonLd
      ? `[JSON-LD structured data]:\n${jsonLd.slice(0, 6000)}`
      : "";

  // High-value blocks first; raw page text takes whatever budget remains.
  const structured = [jsonLdBlock, ingredientSectionBlock, videoSection]
    .filter(Boolean)
    .join("");

  const textBudget = Math.max(0, MAX_PAYLOAD_CHARS - structured.length);
  const textBlock =
    textBudget > 0 && text
      ? structured
        ? `\n\n[Page text (excerpt)]:\n${text.slice(0, textBudget)}`
        : text.slice(0, textBudget)
      : "";

  return normaliseUnicodeFractions(
    (structured + textBlock).slice(0, MAX_PAYLOAD_CHARS),
  );
}

/**
 * Safety net: if the LLM dumped the full string into "item" with empty quantity/unit,
 * parse it client-side with a regex.
 */
function fixIngredientParsing(
  ingredients: Array<{ item: string; quantity: string; unit: string; category?: string; original_text?: string }>,
) {
  return ingredients.map((ing) => {
    // Ensure original_text is set — fall back to reconstructing from fields
    if (!ing.original_text) {
      const parts = [ing.quantity, ing.unit, ing.item].filter(Boolean);
      ing.original_text = parts.join(" ");
    }
    if (ing.quantity || ing.unit) return ing;

    // Strip second measurement from dual-measurement strings like
    // "100 g / 1 stick unsalted butter" before the regex runs,
    // otherwise it can mix numbers/units from both sides.
    if (ing.item?.includes(' / ')) {
      const dualMatch = ing.item.match(
        /^([\d\u00BC-\u00BE\u2150-\u215E\/\.\-–\s]+(?:cups?|tbsps?|tsps?|tablespoons?|teaspoons?|oz|ounces?|lbs?|pounds?|g|grams?|kg|ml|litres?|liters?|cloves?|large|medium|small|cans?|bunch(?:es)?|pieces?|slices?|sprigs?|stalks?|heads?|pinch(?:es)?|handfuls?|packets?|sticks?|rashers?|fillets?)?)\s*\/\s*[\d\u00BC-\u00BE\u2150-\u215E\/\.\-–\s]+(?:cups?|tbsps?|tsps?|tablespoons?|teaspoons?|oz|ounces?|lbs?|pounds?|g|grams?|kg|ml|litres?|liters?|cloves?|large|medium|small|cans?|bunch(?:es)?|pieces?|slices?|sprigs?|stalks?|heads?|pinch(?:es)?|handfuls?|packets?|sticks?|rashers?|fillets?)?\s+(.+)$/i
      );
      if (dualMatch) {
        ing.item = `${dualMatch[1].trim()} ${dualMatch[2].trim()}`;
      }
    }

    const match = ing.item?.match(
      /^([\d\u00BC-\u00BE\u2150-\u215E\/\.\-–]+(?:\s*[\d\/\.]+)?)\s*(cups?|tbsps?|tsps?|tablespoons?|teaspoons?|oz|ounces?|lbs?|pounds?|g|grams?|kg|ml|litres?|liters?|cloves?|large|medium|small|cans?|bunch(?:es)?|pieces?|slices?|sprigs?|stalks?|heads?|pinch(?:es)?|handfuls?|packets?|sticks?|rashers?|fillets?)?\s+(.+)$/i,
    );
    if (match) {
      return {
        ...ing,
        quantity: match[1].trim(),
        unit: (match[2] || "").trim().toLowerCase(),
        item: match[3].trim(),
      };
    }
    return ing;
  });
}

// --- Page fetching ---

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "en-AU,en;q=0.9,en-US;q=0.8",
  "Accept-Encoding": "gzip, deflate, br",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
};

/**
 * Fetch a page's HTML.
 *
 * Tries a plain server-side fetch first (fast, works for most sites). If that
 * is blocked — some hosts return 403/429 to datacenter IPs even with browser
 * headers (e.g. Cloudflare bot protection on marionskitchen.com) — it falls
 * back to Jina AI Reader, which renders the page from a residential-friendly
 * proxy and returns HTML that still includes JSON-LD and og: meta tags, so the
 * rest of the extraction pipeline is unchanged.
 *
 * Returns the HTML on success, or an { error, status } describing the failure.
 */
async function fetchPageHtml(
  url: string,
): Promise<{ html: string } | { error: string; status: number }> {
  // 1. Direct fetch — unchanged behaviour for sites that already work.
  try {
    const res = await fetch(url, { headers: BROWSER_HEADERS, redirect: "follow" });
    if (res.ok) {
      return { html: await res.text() };
    }
    console.warn(`[import-recipe] Direct fetch ${res.status} for ${url} — trying reader fallback`);
  } catch (err) {
    console.warn(`[import-recipe] Direct fetch threw for ${url} (${err}) — trying reader fallback`);
  }

  // 2. Jina AI Reader fallback for bot-protected sites.
  try {
    const jinaKey = Deno.env.get("JINA_API_KEY");
    const readerRes = await fetch(`https://r.jina.ai/${url}`, {
      headers: {
        "X-Return-Format": "html",
        "X-Timeout": "30",
        ...(jinaKey ? { Authorization: `Bearer ${jinaKey}` } : {}),
      },
      redirect: "follow",
    });

    if (readerRes.ok) {
      const html = await readerRes.text();
      if (html.length > 200) {
        return { html };
      }
      console.error(`[import-recipe] Reader returned empty body for ${url}`);
    } else {
      console.error(`[import-recipe] Reader fallback ${readerRes.status} for ${url}`);
    }
  } catch (err) {
    console.error(`[import-recipe] Reader fallback threw for ${url}: ${err}`);
  }

  // Keep the "Failed to fetch page" wording — the web app keys off it to
  // surface the "use the Pie Keeper extension" hint.
  return { error: "Failed to fetch page (403)", status: 422 };
}

/**
 * Re-host an image in Supabase Storage so it can be displayed in the app.
 *
 * Some source sites (e.g. marionskitchen.com) hotlink-protect their images
 * behind Cloudflare: a request whose Referer isn't the source site itself
 * gets a 403 challenge, even though the URL is correct. Browsers send our
 * app's origin as the Referer when rendering <img src="...">, so the image
 * ends up broken. Downloading it server-side (with the source page as
 * Referer, same as a real click-through) and re-hosting it in our own
 * storage bucket sidesteps that entirely.
 *
 * Returns the original URL unchanged if the download/upload fails for any
 * reason — a possibly-blocked image is still a better fallback than none.
 */
async function rehostImage(imageUrl: string, sourcePageUrl: string): Promise<string> {
  try {
    const imgRes = await fetch(imageUrl, {
      headers: {
        "User-Agent": BROWSER_HEADERS["User-Agent"],
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Referer": sourcePageUrl,
      },
    });
    if (!imgRes.ok) {
      console.warn(`[import-recipe] Image download ${imgRes.status} for ${imageUrl}`);
      return imageUrl;
    }

    const contentType = imgRes.headers.get("content-type") ?? "image/jpeg";
    if (!contentType.startsWith("image/")) {
      return imageUrl;
    }
    const bytes = await imgRes.arrayBuffer();
    if (bytes.byteLength === 0 || bytes.byteLength > 15_000_000) {
      return imageUrl;
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      console.warn("[import-recipe] Missing Supabase service credentials — skipping image re-host");
      return imageUrl;
    }

    const ext = contentType.split("/")[1]?.split("+")[0] || "jpg";
    const path = `${crypto.randomUUID()}.${ext}`;

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { error } = await admin.storage
      .from("recipe-images")
      .upload(path, bytes, { contentType, upsert: false });

    if (error) {
      console.error(`[import-recipe] Storage upload failed for ${imageUrl}: ${error.message}`);
      return imageUrl;
    }

    const { data } = admin.storage.from("recipe-images").getPublicUrl(path);
    return data.publicUrl;
  } catch (err) {
    console.error(`[import-recipe] Image re-host threw for ${imageUrl}: ${err}`);
    return imageUrl;
  }
}

// --- Main handler ---

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
      },
    });
  }

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };

  try {
    const { url, html: providedHtml } = await req.json();

    if (!url || typeof url !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing or invalid 'url' field" }),
        { status: 400, headers: corsHeaders },
      );
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid URL format" }),
        { status: 400, headers: corsHeaders },
      );
    }

    // Validate optional HTML parameter
    if (providedHtml !== undefined && (typeof providedHtml !== "string" || providedHtml.length > 2_000_000)) {
      return new Response(
        JSON.stringify({ error: "Invalid 'html' field (must be string, max 2MB)" }),
        { status: 400, headers: corsHeaders },
      );
    }

    // 1. Use provided HTML or fetch the page
    let html: string;

    if (providedHtml) {
      html = providedHtml;
    } else {
      const fetched = await fetchPageHtml(url);
      if ("error" in fetched) {
        console.error(`[import-recipe] ${fetched.error} ${url}`);
        return new Response(
          JSON.stringify({ error: fetched.error }),
          { status: fetched.status, headers: corsHeaders },
        );
      }
      html = fetched.html;
    }

    // 2. Extract content for the LLM
    const htmlExtractedNotes = extractRecipeNotes(html);
    const content = buildLlmPayload(html, url);

    if (content.length < 100) {
      console.error(`[import-recipe] No recipe content found (content length: ${content.length})`);
      return new Response(
        JSON.stringify({ error: "No recipe content found on this page" }),
        { status: 422, headers: corsHeaders },
      );
    }

    // 3. Call Groq API
    const apiKey = Deno.env.get("GROQ_API_KEY");
    if (!apiKey) {
      console.error("[import-recipe] GROQ_API_KEY not set in environment");
      return new Response(
        JSON.stringify({ error: "Groq API key not configured" }),
        { status: 500, headers: corsHeaders },
      );
    }

    const groqRes = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Extract the recipe from this page:\n\n${content}` },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
      }),
    });

    if (!groqRes.ok) {
      if (groqRes.status === 429) {
        console.error("[import-recipe] Groq rate limited (429)");
        return new Response(
          JSON.stringify({ error: "Daily limit reached – try again tomorrow." }),
          { status: 429, headers: corsHeaders },
        );
      }
      const body = await groqRes.text();
      console.error(`[import-recipe] Groq API error (${groqRes.status}): ${body}`);
      return new Response(
        JSON.stringify({ error: `AI extraction failed (${groqRes.status}): ${body}` }),
        { status: 502, headers: corsHeaders },
      );
    }

    const groqData = await groqRes.json();
    const messageContent = groqData.choices?.[0]?.message?.content;

    if (!messageContent) {
      return new Response(
        JSON.stringify({ error: "No response from AI" }),
        { status: 502, headers: corsHeaders },
      );
    }

    const parsed = JSON.parse(messageContent);

    if (parsed.error) {
      return new Response(
        JSON.stringify({ error: parsed.error }),
        { status: 422, headers: corsHeaders },
      );
    }

    // 4. Build structured recipe response
    const ingredients = fixIngredientParsing(parsed.ingredients ?? []);
    // The LLM sometimes returns "" (empty string) when it can't find an
    // image — treat that as "not found" so the deterministic fallbacks run.
    const rawImageUrl =
      firstImageUrl(parsed.image_url) ??
      extractRecipeImageFromJsonLd(html) ??
      extractOgImage(html) ??
      null;
    // Re-host in our own storage so hotlink-protected sources (e.g.
    // marionskitchen.com) don't show a broken image in the app.
    const imageUrl = rawImageUrl ? await rehostImage(rawImageUrl, url) : null;
    const recipe = {
      title: parsed.title,
      description: parsed.description ?? null,
      ingredients,
      steps: parsed.steps ?? [],
      source_url: url,
      creator_name: parsed.creator_name ?? null,
      video_url: parsed.video_url ?? null,
      image_url: imageUrl,
      servings: parseServings(parsed.servings),
      prep_time: parseServings(parsed.prep_time),
      cook_time: parseServings(parsed.cook_time),
      author_notes: htmlExtractedNotes ?? parsed.author_notes ?? null,
    };

    const rawTags = parsed.tags ?? [];
    const tags = (Array.isArray(rawTags) ? rawTags : [])
      .map((t: unknown) => {
        if (typeof t === 'string') return { name: t.trim().toLowerCase(), emoji: '🏷️' };
        const obj = t as { name?: string; emoji?: string };
        return {
          name: String(obj.name ?? '').trim().toLowerCase(),
          emoji: String(obj.emoji ?? '🏷️').trim(),
        };
      })
      .filter((t) => t.name.length > 0 && t.name.length < 50);

    return new Response(
      JSON.stringify({ recipe, tags }),
      { status: 200, headers: corsHeaders },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[import-recipe] Unhandled error: ${message}`);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: corsHeaders },
    );
  }
});

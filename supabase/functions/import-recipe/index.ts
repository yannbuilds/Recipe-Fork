import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";

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
  "tags": [{"name": "tag1", "emoji": "🍽️"}, {"name": "tag2", "emoji": "🍗"}]
}

Example ingredient parsing — JSON-LD "recipeIngredient" contains flat strings. You MUST parse each into separate fields:
- "1 cup all-purpose flour" → { "original_text": "1 cup all-purpose flour", "item": "all-purpose flour", "quantity": "1", "unit": "cup", "category": "" }
- "2 large eggs" → { "original_text": "2 large eggs", "item": "eggs", "quantity": "2", "unit": "large", "category": "" }
- "1/2 tsp salt" → { "original_text": "1/2 tsp salt", "item": "salt", "quantity": "1/2", "unit": "tsp", "category": "" }
- "2-3 cloves garlic, minced" → { "original_text": "2-3 cloves garlic, minced", "item": "garlic, minced", "quantity": "2-3", "unit": "cloves", "category": "" }
- "Fresh cilantro for garnish" → { "original_text": "Fresh cilantro for garnish", "item": "fresh cilantro for garnish", "quantity": "", "unit": "", "category": "" }
- "400g canned tomatoes" → { "original_text": "400g canned tomatoes", "item": "canned tomatoes", "quantity": "400", "unit": "g", "category": "" }

Rules:
- Extract ALL ingredients and ALL steps from the recipe.
- "original_text" MUST be the full ingredient line exactly as it appears on the page, with no modifications. Include fractions, parenthetical conversions, preparation notes, annotations, and qualifiers verbatim. For example: "2/3 cup (150 ml) yoghurt, plain" or "750g (1.5 lb) chicken thighs, skin on, bone in, halved along bone (Note 1)". Do NOT paraphrase or restructure.
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

function buildLlmPayload(html: string, url: string): string {
  const jsonLd = extractJsonLd(html);
  const videoUrls = extractVideoUrls(html);
  const ingredientSections = extractIngredientSections(html);
  const videoSection =
    videoUrls.length > 0
      ? `\n\n[Video URLs found on page]:\n${videoUrls.join("\n")}`
      : "";
  const ingredientSectionBlock = ingredientSections
    ? `\n\n[Ingredient sections from page (with group headings)]:\n${ingredientSections}`
    : "";

  if (jsonLd) {
    const text = extractMainText(html);
    const truncatedText = text.slice(0, 8000);
    return (
      `[JSON-LD structured data]:\n${jsonLd}\n\n` +
      `[Page text (excerpt)]:\n${truncatedText}` +
      ingredientSectionBlock +
      videoSection
    );
  }

  const text = extractMainText(html);
  return text.slice(0, 12000) + ingredientSectionBlock + videoSection;
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
    const { url } = await req.json();

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

    // 1. Fetch the page HTML
    const pageRes = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
    });

    if (!pageRes.ok) {
      console.error(`[import-recipe] Failed to fetch page: ${pageRes.status} ${url}`);
      return new Response(
        JSON.stringify({ error: `Failed to fetch page (${pageRes.status})` }),
        { status: 422, headers: corsHeaders },
      );
    }

    const html = await pageRes.text();

    // 2. Extract content for the LLM
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
    const recipe = {
      title: parsed.title,
      description: parsed.description ?? null,
      ingredients,
      steps: parsed.steps ?? [],
      source_url: url,
      creator_name: parsed.creator_name ?? null,
      video_url: parsed.video_url ?? null,
      image_url: parsed.image_url ?? null,
      servings: parseServings(parsed.servings),
      prep_time: parseServings(parsed.prep_time),
      cook_time: parseServings(parsed.cook_time),
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

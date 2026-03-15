import type { RecipeInsert } from "@recipe-aggregator/shared";

export interface ExtractedRecipe {
  recipe: RecipeInsert;
  tagNames: string[];
}

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";

const SYSTEM_PROMPT = `You are a recipe extraction assistant. Given the HTML of a web page, extract the recipe data and return it as JSON.

Return ONLY a JSON object with this exact structure:
{
  "title": "Recipe title",
  "description": "Brief description or null",
  "ingredients": [
    { "item": "ingredient name", "quantity": "amount as string", "unit": "unit of measurement", "category": "optional grouping" }
  ],
  "steps": [
    { "order": 1, "instruction": "step instruction", "category": "optional grouping" }
  ],
  "servings": null or number,
  "prep_time": null or number in minutes,
  "cook_time": null or number in minutes,
  "image_url": "full image URL or null",
  "video_url": "full video URL or null",
  "tags": ["tag1", "tag2", "tag3"]
}

Rules:
- Extract ALL ingredients and ALL steps from the recipe.
- For ingredients: "quantity" should be a string (e.g. "1/2", "2-3"). "unit" should be standardised (e.g. "cup", "tbsp", "g"). If no unit, use an empty string.
- For steps: number them sequentially starting at 1. Keep the full instruction text.
- IMPORTANT — Categories: If ingredients or steps are grouped into sections, you MUST set the "category" field for each item in that group.
  - For steps: if JSON-LD contains "HowToSection" objects, use the section "name" as the category (e.g. "Par Boiled Rice", "Crispy Onions"). If page text has section headings before steps, use those.
  - For ingredients: JSON-LD usually lists ingredients flat without groups. Check the page text for section headings (e.g. "Marinade", "For the sauce", "Rice", "Garnish") that separate ingredient lists, and assign those as categories.
  - Strip trailing colons from category names (e.g. "Marinade:" → "Marinade").
- Times should be in minutes (convert hours to minutes).
- Look for structured data (JSON-LD) first, then fall back to page content.
- For video_url: check the "[Video URLs found on page]" section first — if present, use the first URL. Also check JSON-LD "video" field. Return a full YouTube watch URL (https://www.youtube.com/watch?v=...) or null if no video exists.
- For tags: suggest 3–8 lowercase tags that describe the recipe. Include relevant cuisine (e.g. "indian", "italian", "mexican"), protein (e.g. "chicken", "beef", "tofu"), meal type (e.g. "dinner", "dessert", "snack", "breakfast"), dietary info (e.g. "vegetarian", "gluten-free"), or cooking method (e.g. "grilled", "one-pot", "slow-cooker"). Keep tags short, all lowercase, no duplicates.
- If you cannot find a recipe on the page, return: { "error": "No recipe found on this page" }`;

/**
 * Send cleaned page HTML to Groq (Llama 3.3 70B) and extract structured recipe data.
 */
export async function extractRecipe(
  html: string,
  url: string,
): Promise<ExtractedRecipe> {
  const apiKey = import.meta.env.VITE_GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("Groq API key not configured. Add VITE_GROQ_API_KEY to .env");
  }

  const res = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Extract the recipe from this page:\n\n${html}` },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
    }),
  });

  if (!res.ok) {
    if (res.status === 429) {
      throw new Error("Daily limit reached – try again tomorrow.");
    }
    const body = await res.text();
    throw new Error(`Groq API error (${res.status}): ${body}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("No response from Groq API");
  }

  const parsed = JSON.parse(content);

  if (parsed.error) {
    throw new Error(parsed.error);
  }

  // Build RecipeInsert with source_url from the actual page
  const recipe: RecipeInsert = {
    title: parsed.title,
    description: parsed.description ?? null,
    ingredients: parsed.ingredients ?? [],
    steps: parsed.steps ?? [],
    source_url: url,
    video_url: parsed.video_url ?? null,
    image_url: parsed.image_url ?? null,
    servings: parsed.servings ?? null,
    prep_time: parsed.prep_time ?? null,
    cook_time: parsed.cook_time ?? null,
  };

  // Parse and normalise tags from LLM response
  const rawTags = parsed.tags ?? [];
  const tagNames = (Array.isArray(rawTags) ? rawTags : [])
    .map((t: string) => String(t).trim().toLowerCase())
    .filter((t: string) => t.length > 0 && t.length < 50);

  return { recipe, tagNames };
}

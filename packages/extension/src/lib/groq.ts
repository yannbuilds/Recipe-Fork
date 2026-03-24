import type { RecipeInsert } from "@recipe-aggregator/shared";

// user_id and is_favourite are added at insert time in popup/index.ts
export type ExtractedRecipeData = Omit<RecipeInsert, 'user_id' | 'is_favourite'>;

export interface ExtractedTag {
  name: string;
  emoji: string;
}

export interface ExtractedRecipe {
  recipe: ExtractedRecipeData;
  tags: ExtractedTag[];
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
  "creator_name": "recipe author/creator name or null",
  "tags": [{"name": "tag1", "emoji": "🍽️"}, {"name": "tag2", "emoji": "🍗"}]
}

Rules:
- Extract ALL ingredients and ALL steps from the recipe.
- For ingredients: Parse each ingredient into its components carefully.
  - "quantity" should be a string (e.g. "1/2", "2-3", "1.5").
  - "unit" should be the unit of measurement (e.g. "cup", "tbsp", "tsp", "g", "kg", "ml", "L", "oz", "lb", "bunch", "clove", "can", "packet"). NEVER leave unit empty when a measurement is present in the source text.
  - JSON-LD recipeIngredient values are often compound strings. You MUST split them correctly:
    - "400ml coconut milk" → quantity: "400", unit: "ml", item: "coconut milk"
    - "1.5 kg lamb shanks" → quantity: "1.5", unit: "kg", item: "lamb shanks"
    - "2 cups chicken stock" → quantity: "2", unit: "cup", item: "chicken stock"
    - "114g Massaman curry paste" → quantity: "114", unit: "g", item: "Massaman curry paste"
    - "3 cloves garlic" → quantity: "3", unit: "clove", item: "garlic"
    - "1 bunch coriander" → quantity: "1", unit: "bunch", item: "coriander"
  - Only use an empty string for unit when the ingredient is truly unitless (e.g. "2 eggs" → quantity: "2", unit: "", item: "eggs").
- For steps: number them sequentially starting at 1. Keep the full instruction text.
- IMPORTANT — Categories: If ingredients or steps are grouped into sections, you MUST set the "category" field for EVERY item in that group.
  - For ingredients: Check the "[Ingredient sections from page]" data first — if present, it contains the exact section names and their ingredients. Use these section names as the category for each ingredient. If "[Ingredient sections from page]" is not present, check the page text for section headings (e.g. "Marinade", "For the sauce", "Garnish") that separate ingredient lists.
  - For steps: if JSON-LD contains "HowToSection" objects, use the section "name" as the category. If page text has section headings before steps, use those.
  - Strip trailing colons from category names (e.g. "Marinade:" → "Marinade").
  - If no section groupings exist at all, omit the category field entirely.
- Times should be in minutes (convert hours to minutes).
- Look for structured data (JSON-LD) first, then fall back to page content.
- For video_url: check the "[Video URLs found on page]" section first — if present, use the first URL. Also check JSON-LD "video" field. Return a full YouTube watch URL (https://www.youtube.com/watch?v=...) or null if no video exists.
- For tags: suggest 3–5 tags as objects with "name" (lowercase) and "emoji" (a single emoji that represents the tag). Only use tags that help filter recipes by: cuisine (e.g. "indian", "italian", "mexican", "chinese"), protein (e.g. "chicken", "beef", "fish", "tofu"), meal type (e.g. "dinner", "breakfast", "dessert", "snack"), or dietary restriction (e.g. "vegetarian", "vegan", "gluten-free"). Do NOT include generic adjectives like "easy", "quick", "healthy", "moist", "delicious", or ingredient names that aren't the main protein.
- For creator_name: extract the recipe author/creator name. Check JSON-LD "author.name", byline elements, or meta tags. Return the name as-is (e.g. "Nagi | RecipeTin Eats"). Return null if not found.
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

  // Build recipe data (user_id and is_favourite are added at insert time in popup)
  const recipe: ExtractedRecipeData = {
    title: parsed.title,
    description: parsed.description ?? null,
    ingredients: parsed.ingredients ?? [],
    steps: parsed.steps ?? [],
    source_url: url,
    creator_name: parsed.creator_name ?? null,
    video_url: parsed.video_url ?? null,
    image_url: parsed.image_url ?? null,
    servings: parsed.servings ?? null,
    prep_time: parsed.prep_time ?? null,
    cook_time: parsed.cook_time ?? null,
  };

  // Parse and normalise tags from LLM response
  const rawTags = parsed.tags ?? [];
  const tags: ExtractedTag[] = (Array.isArray(rawTags) ? rawTags : [])
    .map((t: unknown) => {
      if (typeof t === 'string') return { name: t.trim().toLowerCase(), emoji: '🏷️' };
      const obj = t as { name?: string; emoji?: string };
      return {
        name: String(obj.name ?? '').trim().toLowerCase(),
        emoji: String(obj.emoji ?? '🏷️').trim(),
      };
    })
    .filter((t) => t.name.length > 0 && t.name.length < 50);

  return { recipe, tags };
}

import type { RecipeInsert } from "@recipe-aggregator/shared";

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
  "video_url": "full video URL or null"
}

Rules:
- Extract ALL ingredients and ALL steps from the recipe.
- For ingredients: "quantity" should be a string (e.g. "1/2", "2-3"). "unit" should be standardised (e.g. "cup", "tbsp", "g"). If no unit, use an empty string.
- For steps: number them sequentially starting at 1. Keep the full instruction text.
- If ingredients or steps are grouped (e.g. "For the sauce", "For the dough"), use the "category" field.
- Times should be in minutes (convert hours to minutes).
- Look for structured data (JSON-LD) first, then fall back to page content.
- If you cannot find a recipe on the page, return: { "error": "No recipe found on this page" }`;

/**
 * Send cleaned page HTML to Groq (Llama 3.3 70B) and extract structured recipe data.
 */
export async function extractRecipe(
  html: string,
  url: string,
): Promise<RecipeInsert> {
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

  return recipe;
}

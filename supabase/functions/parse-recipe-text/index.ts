import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "openai/gpt-oss-120b";
const MAX_TEXT_LENGTH = 50_000;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

type JsonObject = Record<string, unknown>;

const CLASSIFY_PROMPT = `You are a lossless recipe text classifier. Organise supplied text into fields without editing the recipe.

Return ONLY one JSON object:
{
  "title": "exact title from the input or empty string",
  "description": "exact description from the input or null",
  "ingredients": [
    { "original_text": "complete ingredient line copied from the input", "item": "ingredient name", "quantity": "amount", "unit": "unit", "category": "section heading or empty string" }
  ],
  "steps": [
    { "order": 1, "instruction": "complete instruction copied from the input", "category": "section heading or empty string" }
  ],
  "servings": null,
  "prep_time": null,
  "cook_time": null,
  "creator_name": null,
  "author_notes": null,
  "source_url": "",
  "tags": [{ "name": "dinner", "emoji": "🍽️" }],
  "uncertain": []
}

Non-negotiable rules:
- Classify only. Never rewrite, improve, summarise, correct, reorder, or add recipe content.
- Copy every ingredient original_text and every step instruction verbatim from the supplied text. Removing a bullet or step number is allowed; changing words is not.
- Include every ingredient and every instruction. Preserve their source order.
- item, quantity, and unit may classify an ingredient line, but original_text must retain the full source line.
- Use section headings as category without a trailing colon.
- Extract description, times, servings, creator, notes, and source URL only when explicitly present. Otherwise use null or an empty string.
- Convert an explicitly stated duration to whole minutes. Do not estimate it.
- Tags are suggestions only: return 3–5 lowercase tags limited to cuisine, main protein, meal type, or explicit dietary restriction.
- Put any ambiguous source fragment into uncertain. Never resolve ambiguity by guessing.
- A valid recipe requires a title, at least one ingredient, and at least one instruction. Return the fields you can identify even if one is missing.`;

const DESCRIPTION_PROMPT = `Write one short, appealing recipe description using only facts present in the supplied title, ingredients, and instructions. Do not invent taste claims, origin, difficulty, occasion, dietary status, or serving suggestions. Return ONLY JSON: {"description":"..."}.`;

function json(body: JsonObject, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: CORS_HEADERS });
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nullableString(value: unknown): string | null {
  return cleanString(value) || null;
}

function nullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.round(value));
  if (typeof value === "string") {
    const match = value.match(/\d+(?:\.\d+)?/);
    if (match) return Math.max(0, Math.round(Number(match[0])));
  }
  return null;
}

function comparable(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/^[\s\-*•·‣▪◦]+/, "")
    .replace(/^\s*(?:step\s*)?\d+[.)\-:]\s*/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
}

function isSourced(value: string, source: string): boolean {
  const candidate = comparable(value);
  return candidate.length > 0 && comparable(source).includes(candidate);
}

function normaliseIngredients(value: unknown, source: string) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as JsonObject;
    const originalText = cleanString(row.original_text);
    const item = cleanString(row.item);
    if (!originalText || !isSourced(originalText, source)) {
      throw new Error("An ingredient was not copied faithfully from the pasted text");
    }
    return [{
      original_text: originalText,
      item: item || originalText,
      quantity: cleanString(row.quantity),
      unit: cleanString(row.unit).toLowerCase(),
      category: cleanString(row.category).replace(/:$/, ""),
    }];
  });
}

function normaliseSteps(value: unknown, source: string) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, index) => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as JsonObject;
    const instruction = cleanString(row.instruction);
    if (!instruction || !isSourced(instruction, source)) {
      throw new Error("An instruction was not copied faithfully from the pasted text");
    }
    return [{
      order: index + 1,
      instruction,
      category: cleanString(row.category).replace(/:$/, ""),
    }];
  });
}

function normaliseTags(value: unknown) {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((entry) => {
    const row = typeof entry === "string" ? { name: entry } : entry;
    if (!row || typeof row !== "object") return [];
    const object = row as JsonObject;
    const name = cleanString(object.name).toLowerCase();
    if (!name || name.length >= 50 || seen.has(name)) return [];
    seen.add(name);
    return [{ name, emoji: cleanString(object.emoji) || "🏷️" }];
  }).slice(0, 5);
}

async function askGroq(key: string, system: string, user: string, maxTokens: number) {
  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      response_format: { type: "json_object" },
      temperature: 0,
      max_completion_tokens: maxTokens,
    }),
  });
  if (!response.ok) {
    const details = await response.text().catch(() => "");
    console.error(`[parse-recipe-text] Groq ${response.status}: ${details}`);
    throw new Error(response.status === 429 ? "AI limit reached – try again shortly." : "The recipe could not be organised");
  }
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("No organised recipe was returned");
  return JSON.parse(content) as JsonObject;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const groqKey = Deno.env.get("GROQ_API_KEY");
  if (!supabaseUrl || !anonKey || !groqKey) return json({ error: "Recipe organiser is not configured" }, 500);

  const authorization = req.headers.get("Authorization") ?? "";
  const client = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: { user } } = await client.auth.getUser();
  if (!user) return json({ error: "Please sign in to organise a recipe" }, 401);

  try {
    const body = await req.json() as { action?: unknown; text?: unknown; recipe?: unknown };
    const action = body.action === "draft-description" ? "draft-description" : "classify";

    if (action === "draft-description") {
      const recipe = body.recipe && typeof body.recipe === "object" ? body.recipe as JsonObject : {};
      const input = JSON.stringify({
        title: cleanString(recipe.title),
        ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients : [],
        steps: Array.isArray(recipe.steps) ? recipe.steps : [],
      });
      if (!cleanString(recipe.title)) return json({ error: "Add a title before drafting a description" }, 400);
      const parsed = await askGroq(groqKey, DESCRIPTION_PROMPT, input, 220);
      return json({ description: cleanString(parsed.description) });
    }

    const source = typeof body.text === "string" ? body.text.trim() : "";
    if (source.length < 20) return json({ error: "Paste a little more of the recipe first" }, 400);
    if (source.length > MAX_TEXT_LENGTH) return json({ error: "That paste is too long. Keep it under 50,000 characters." }, 413);

    const parsed = await askGroq(groqKey, CLASSIFY_PROMPT, source, 7000);
    const title = cleanString(parsed.title);
    if (title && !isSourced(title, source)) throw new Error("The title was not copied faithfully from the pasted text");
    const description = nullableString(parsed.description);
    if (description && !isSourced(description, source)) throw new Error("The description was not copied faithfully from the pasted text");

    const recipe = {
      title,
      description,
      ingredients: normaliseIngredients(parsed.ingredients, source),
      steps: normaliseSteps(parsed.steps, source),
      servings: nullableNumber(parsed.servings),
      prep_time: nullableNumber(parsed.prep_time),
      cook_time: nullableNumber(parsed.cook_time),
      creator_name: nullableString(parsed.creator_name),
      author_notes: nullableString(parsed.author_notes),
      source_url: cleanString(parsed.source_url),
    };

    return json({
      recipe,
      tags: normaliseTags(parsed.tags),
      uncertain: Array.isArray(parsed.uncertain) ? parsed.uncertain.map(cleanString).filter(Boolean).slice(0, 10) : [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The recipe could not be organised";
    console.error(`[parse-recipe-text] ${message}`);
    const fidelityError = message.includes("faithfully");
    return json({ error: fidelityError ? `${message}. Nothing has been changed—please try again.` : message }, fidelityError ? 422 : 502);
  }
});

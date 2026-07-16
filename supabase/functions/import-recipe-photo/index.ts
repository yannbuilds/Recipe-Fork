import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";
const SCAN_BUCKET = "recipe-scans";
const HERO_BUCKET = "recipe-images";
const MAX_IMAGES = 5;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const PHOTO_RECIPE_PROMPT = `You extract a recipe from one or more photos. The images are ordered pages of the same recipe.

Return ONLY one JSON object with this exact structure:
{
  "title": "Recipe title",
  "description": "Brief description or null",
  "ingredients": [
    { "original_text": "full ingredient line exactly as shown", "item": "ingredient name", "quantity": "amount as a string", "unit": "unit", "category": "section heading or empty string" }
  ],
  "steps": [
    { "order": 1, "instruction": "full instruction", "category": "section heading or empty string" }
  ],
  "servings": null,
  "prep_time": null,
  "cook_time": null,
  "creator_name": null,
  "author_notes": null,
  "tags": [{ "name": "dinner", "emoji": "🍽️" }],
  "hero_image_index": null
}

Rules:
- Read every supplied page before answering. Combine split ingredient lists and methods in page order, removing overlap caused by repeated lines between photos.
- Transcribe only what is visible. Never invent missing ingredients, quantities, temperatures, times, or steps.
- A valid result needs a clear title, at least one ingredient, and at least one instruction. If the photos do not contain a readable recipe, return { "error": "No readable recipe found in these photos" }.
- original_text must preserve the complete ingredient line as printed, including fractions, notes, and alternate measurements.
- Parse each ingredient into quantity, unit, and item. For "1 cup / 250 ml milk", use quantity "1", unit "cup", item "milk" while preserving the complete line in original_text.
- Keep section headings in category for both ingredients and steps, without trailing colons.
- Number steps sequentially from 1. Preserve useful paragraph detail; do not summarize away temperatures or timings.
- Convert prep_time and cook_time to whole minutes. Use null when not printed. For a serving range use the lower number.
- Copy author notes/tips verbatim into author_notes, separated by newlines. Do not include the Notes heading itself.
- Suggest 3–5 lowercase tags limited to cuisine, main protein, meal type, or dietary restriction. Each emoji must be one relevant emoji.
- hero_image_index is a zero-based image index only when that whole image is primarily an appetising photo of the completed dish with little or no recipe text. Otherwise return null.`;

type JsonObject = Record<string, unknown>;

function json(body: JsonObject, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: CORS_HEADERS });
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nullableString(value: unknown): string | null {
  const cleaned = cleanString(value);
  return cleaned || null;
}

function nullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.round(value));
  if (typeof value === "string") {
    const match = value.match(/\d+(?:\.\d+)?/);
    if (match) return Math.max(0, Math.round(Number(match[0])));
  }
  return null;
}

function normaliseIngredients(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as JsonObject;
    const originalText = cleanString(row.original_text);
    const item = cleanString(row.item);
    if (!item && !originalText) return [];
    return [{
      original_text: originalText || [row.quantity, row.unit, item].map(cleanString).filter(Boolean).join(" "),
      item: item || originalText,
      quantity: cleanString(row.quantity),
      unit: cleanString(row.unit).toLowerCase(),
      category: cleanString(row.category).replace(/:$/, ""),
    }];
  });
}

function normaliseSteps(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, index) => {
    const row = typeof entry === "string" ? { instruction: entry } : entry;
    if (!row || typeof row !== "object") return [];
    const object = row as JsonObject;
    const instruction = cleanString(object.instruction);
    if (!instruction) return [];
    return [{
      order: index + 1,
      instruction,
      category: cleanString(object.category).replace(/:$/, ""),
    }];
  });
}

function normaliseTags(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const row = typeof entry === "string" ? { name: entry } : entry;
    if (!row || typeof row !== "object") return [];
    const object = row as JsonObject;
    const name = cleanString(object.name).toLowerCase();
    if (!name || name.length >= 50) return [];
    return [{ name, emoji: cleanString(object.emoji) || "🏷️" }];
  }).slice(0, 5);
}

function extensionForContentType(contentType: string): string {
  const subtype = contentType.split("/")[1]?.toLowerCase() ?? "jpeg";
  if (subtype.includes("png")) return "png";
  if (subtype.includes("webp")) return "webp";
  if (subtype.includes("heic")) return "heic";
  if (subtype.includes("heif")) return "heif";
  return "jpg";
}

async function preserveHeroImage(
  admin: ReturnType<typeof createClient>,
  signedUrl: string,
): Promise<string | null> {
  try {
    const response = await fetch(signedUrl);
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") ?? "image/jpeg";
    if (!contentType.startsWith("image/")) return null;
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength === 0 || bytes.byteLength > 20_000_000) return null;
    const path = `${crypto.randomUUID()}.${extensionForContentType(contentType)}`;
    const { error } = await admin.storage.from(HERO_BUCKET).upload(path, bytes, {
      contentType,
      upsert: false,
    });
    if (error) {
      console.error(`[import-recipe-photo] Could not preserve hero image: ${error.message}`);
      return null;
    }
    return admin.storage.from(HERO_BUCKET).getPublicUrl(path).data.publicUrl;
  } catch (error) {
    console.error(`[import-recipe-photo] Hero image failed: ${error}`);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const groqKey = Deno.env.get("GROQ_API_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !groqKey) {
    return json({ error: "Photo import is not configured" }, 500);
  }

  const authorization = req.headers.get("Authorization") ?? "";
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return json({ error: "Please sign in to import photos" }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey);
  let paths: string[] = [];

  try {
    const body = await req.json() as { paths?: unknown };
    if (!Array.isArray(body.paths)) return json({ error: "No photos supplied" }, 400);
    paths = body.paths.filter((path): path is string => typeof path === "string");
    if (paths.length < 1 || paths.length > MAX_IMAGES) {
      return json({ error: `Choose between 1 and ${MAX_IMAGES} photos` }, 400);
    }
    if (paths.some((path) => !path.startsWith(`${user.id}/`) || path.includes(".."))) {
      return json({ error: "Invalid photo path" }, 403);
    }

    const { data: signed, error: signedError } = await admin.storage
      .from(SCAN_BUCKET)
      .createSignedUrls(paths, 10 * 60);
    if (signedError || !signed || signed.some((item) => item.error || !item.signedUrl)) {
      console.error(`[import-recipe-photo] Signing failed: ${signedError?.message ?? "missing object"}`);
      return json({ error: "One or more photos could not be read" }, 422);
    }

    const signedUrls = signed.map((item) => item.signedUrl!);
    const content = [
      { type: "text", text: PHOTO_RECIPE_PROMPT },
      ...signedUrls.map((url) => ({ type: "image_url", image_url: { url } })),
    ];
    const groqResponse = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${groqKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: VISION_MODEL,
        messages: [{ role: "user", content }],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_completion_tokens: 6000,
      }),
    });

    if (!groqResponse.ok) {
      const details = await groqResponse.text().catch(() => "");
      console.error(`[import-recipe-photo] Groq ${groqResponse.status}: ${details}`);
      const message = groqResponse.status === 429
        ? "Photo scanning limit reached – try again shortly."
        : "The recipe could not be read from those photos";
      return json({ error: message }, groqResponse.status === 429 ? 429 : 502);
    }

    const groqData = await groqResponse.json();
    const rawContent = groqData.choices?.[0]?.message?.content;
    if (typeof rawContent !== "string") return json({ error: "No recipe was returned" }, 502);

    let parsed: JsonObject;
    try {
      parsed = JSON.parse(rawContent) as JsonObject;
    } catch {
      return json({ error: "The scanned recipe was not valid. Try clearer photos." }, 502);
    }
    if (parsed.error) return json({ error: cleanString(parsed.error) || "No readable recipe found" }, 422);

    const ingredients = normaliseIngredients(parsed.ingredients);
    const steps = normaliseSteps(parsed.steps);
    const title = cleanString(parsed.title);
    if (!title || ingredients.length === 0 || steps.length === 0) {
      return json({ error: "The scan was incomplete. Make sure the title, ingredients, and method are visible." }, 422);
    }

    const requestedHeroIndex = typeof parsed.hero_image_index === "number"
      ? Math.trunc(parsed.hero_image_index)
      : -1;
    const imageUrl = requestedHeroIndex >= 0 && requestedHeroIndex < signedUrls.length
      ? await preserveHeroImage(admin, signedUrls[requestedHeroIndex])
      : null;

    return json({
      recipe: {
        title,
        description: nullableString(parsed.description),
        ingredients,
        steps,
        source_url: "",
        creator_name: nullableString(parsed.creator_name),
        video_url: null,
        image_url: imageUrl,
        servings: nullableNumber(parsed.servings),
        prep_time: nullableNumber(parsed.prep_time),
        cook_time: nullableNumber(parsed.cook_time),
        author_notes: nullableString(parsed.author_notes),
      },
      tags: normaliseTags(parsed.tags),
      extraction: {
        method: "vision-ocr",
        image_count: paths.length,
        hero_from_photo: Boolean(imageUrl),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[import-recipe-photo] ${message}`);
    return json({ error: "Something went wrong while scanning the photos" }, 500);
  } finally {
    if (paths.length > 0) {
      const { error } = await admin.storage.from(SCAN_BUCKET).remove(paths);
      if (error) console.error(`[import-recipe-photo] Cleanup failed: ${error.message}`);
    }
  }
});

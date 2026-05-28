import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";

// Keep aligned with PRESET_EMOJIS in packages/web/src/components/CookbookFormModal.tsx
const ALLOWED_EMOJIS = ["📖", "🍝", "🥗", "🍰", "🍱", "🍳", "🥘", "🍲", "🍕", "🌮", "🍜", "🥐"];
const FALLBACK_EMOJI = "📖";

const MAX_RECIPES = 150;
const MAX_SUGGESTIONS = 3;
const MIN_RECIPES_PER_SUGGESTION = 3;
const MAX_RECIPES_PER_SUGGESTION = 12;
const NAME_MAX = 60;
const DESCRIPTION_MAX = 140;
const MIN_LIBRARY_SIZE = 5;

interface Suggestion {
  name: string;
  description: string;
  emoji: string;
  recipe_ids: string[];
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

const jsonHeaders = {
  ...corsHeaders,
  "Content-Type": "application/json",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Missing Authorization header" }),
        { status: 401, headers: jsonHeaders },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseAnonKey) {
      return new Response(
        JSON.stringify({ error: "Server misconfigured" }),
        { status: 500, headers: jsonHeaders },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: jsonHeaders },
      );
    }

    const body = await req.json().catch(() => ({}));
    const avoidNames: string[] = Array.isArray(body?.avoidNames)
      ? body.avoidNames.filter((n: unknown) => typeof n === "string").slice(0, 20)
      : [];

    // Fetch user's recipes (RLS enforces user_id)
    const { data: recipesData, error: recipesErr } = await supabase
      .from("recipes")
      .select("id, title, ingredients, recipe_tags(tags(name))")
      .order("created_at", { ascending: false })
      .limit(MAX_RECIPES);

    if (recipesErr) {
      console.error("[suggest-cookbooks] recipes fetch error", recipesErr);
      return new Response(
        JSON.stringify({ error: "Failed to load recipes" }),
        { status: 500, headers: jsonHeaders },
      );
    }

    const recipes = (recipesData ?? []) as Array<{
      id: string;
      title: string;
      ingredients: Array<{ item?: string }> | null;
      recipe_tags: Array<{ tags: { name: string } | { name: string }[] | null }> | null;
    }>;

    if (recipes.length < MIN_LIBRARY_SIZE) {
      return new Response(
        JSON.stringify({ suggestions: [], reason: "library_too_small" }),
        { status: 200, headers: jsonHeaders },
      );
    }

    // Fetch existing cookbook names so Groq avoids duplicates
    const { data: cookbooksData } = await supabase
      .from("cookbooks")
      .select("name");
    const existingNames = ((cookbooksData ?? []) as Array<{ name: string }>)
      .map((c) => c.name)
      .filter(Boolean);

    const ownedRecipeIds = new Set(recipes.map((r) => r.id));

    const compactRecipes = recipes.map((r) => {
      const tagNames: string[] = [];
      for (const rt of r.recipe_tags ?? []) {
        const tag = Array.isArray(rt.tags) ? rt.tags[0] : rt.tags;
        if (tag?.name) tagNames.push(tag.name);
      }
      const keyIngredients = (r.ingredients ?? [])
        .slice(0, 4)
        .map((i) => i?.item)
        .filter(Boolean);
      return {
        id: r.id,
        title: r.title,
        tags: tagNames,
        key_ingredients: keyIngredients,
      };
    });

    const apiKey = Deno.env.get("GROQ_API_KEY");
    if (!apiKey) {
      console.error("[suggest-cookbooks] GROQ_API_KEY not set");
      return new Response(
        JSON.stringify({ error: "AI not configured" }),
        { status: 500, headers: jsonHeaders },
      );
    }

    let suggestions = await askGroq(apiKey, compactRecipes, existingNames, avoidNames);
    suggestions = validate(suggestions, ownedRecipeIds);

    // One retry if validation strips below MAX_SUGGESTIONS
    if (suggestions.length < MAX_SUGGESTIONS) {
      const retried = await askGroq(
        apiKey,
        compactRecipes,
        existingNames,
        [...avoidNames, ...suggestions.map((s) => s.name)],
      );
      const merged = validate([...suggestions, ...retried], ownedRecipeIds);
      suggestions = dedupeByName(merged).slice(0, MAX_SUGGESTIONS);
    } else {
      suggestions = suggestions.slice(0, MAX_SUGGESTIONS);
    }

    return new Response(
      JSON.stringify({ suggestions }),
      { status: 200, headers: jsonHeaders },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[suggest-cookbooks] Unhandled error: ${message}`);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: jsonHeaders },
    );
  }
});

async function askGroq(
  apiKey: string,
  recipes: Array<{ id: string; title: string; tags: string[]; key_ingredients: string[] }>,
  existingNames: string[],
  avoidNames: string[],
): Promise<Suggestion[]> {
  const systemMessage = `You help organise a personal recipe library into themed cookbooks.

You receive a JSON array of the user's saved recipes (id, title, tags, key ingredients). Your job: propose exactly 3 cookbook groupings that the user would find genuinely useful.

Rules for good suggestions:
- Each cookbook must group recipes around a clear, specific theme — cuisine ("Thai weeknights"), occasion ("Sunday slow cooks"), method ("Sheet-pan dinners"), season ("Summer salads"), or dietary pattern ("Meatless mains"). Avoid generic themes like "Dinner" or "Favourites".
- Each cookbook must contain between ${MIN_RECIPES_PER_SUGGESTION} and ${MAX_RECIPES_PER_SUGGESTION} recipes, all drawn from the input list. Use recipe ids exactly as given.
- A recipe may appear in more than one cookbook if it genuinely fits.
- Name: <= ${NAME_MAX} characters, title case, no emoji in the name itself.
- Description: <= ${DESCRIPTION_MAX} characters, one sentence, written in plain Australian English, explaining who the cookbook is for or when to reach for it.
- Emoji: pick ONE from the allowlist passed in the user message.
- Do NOT propose themes that duplicate the user's existing cookbook names (also passed in the user message).
- Return STRICT JSON only. No prose, no markdown, no code fences.

Output shape:
{
  "suggestions": [
    { "name": string, "description": string, "emoji": string, "recipe_ids": string[] }
  ]
}`;

  const userParts: string[] = [];
  userParts.push(`Allowed emojis: ${ALLOWED_EMOJIS.join(" ")}`);
  userParts.push("");
  userParts.push("My existing cookbooks (don't duplicate these themes):");
  userParts.push(JSON.stringify(existingNames.length ? existingNames : "none yet"));
  userParts.push("");
  userParts.push("My saved recipes:");
  userParts.push(JSON.stringify(recipes));
  if (avoidNames.length) {
    userParts.push("");
    userParts.push(`Avoid repeating these suggestion names: ${JSON.stringify(avoidNames)}`);
  }
  userParts.push("");
  userParts.push("Propose 3 cookbooks.");

  const groqRes = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: userParts.join("\n") },
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
    }),
  });

  if (!groqRes.ok) {
    console.error(`[suggest-cookbooks] Groq API error (${groqRes.status})`);
    return [];
  }

  const groqData = await groqRes.json();
  const content = groqData.choices?.[0]?.message?.content;
  if (!content) return [];

  try {
    const parsed = JSON.parse(content);
    const list = Array.isArray(parsed?.suggestions) ? parsed.suggestions : [];
    return list as Suggestion[];
  } catch (err) {
    console.error("[suggest-cookbooks] JSON parse failed", err);
    return [];
  }
}

function validate(raw: Suggestion[], ownedRecipeIds: Set<string>): Suggestion[] {
  const out: Suggestion[] = [];
  for (const s of raw) {
    if (!s || typeof s !== "object") continue;
    const name = typeof s.name === "string" ? s.name.trim().slice(0, NAME_MAX) : "";
    const description = typeof s.description === "string"
      ? s.description.trim().slice(0, DESCRIPTION_MAX)
      : "";
    const emoji = typeof s.emoji === "string" && ALLOWED_EMOJIS.includes(s.emoji)
      ? s.emoji
      : FALLBACK_EMOJI;
    const ids = Array.isArray(s.recipe_ids)
      ? Array.from(new Set(s.recipe_ids.filter((id): id is string =>
          typeof id === "string" && ownedRecipeIds.has(id)
        )))
      : [];
    if (!name || ids.length < MIN_RECIPES_PER_SUGGESTION) continue;
    out.push({
      name,
      description,
      emoji,
      recipe_ids: ids.slice(0, MAX_RECIPES_PER_SUGGESTION),
    });
  }
  return out;
}

function dedupeByName(list: Suggestion[]): Suggestion[] {
  const seen = new Set<string>();
  const out: Suggestion[] = [];
  for (const s of list) {
    const key = s.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";

const MAX_CANDIDATES = 50;
const MAX_SUGGESTIONS = 8;
const MIN_CANDIDATES = 3;
const REASON_MAX = 120;

interface Suggestion {
  recipe_id: string;
  reason: string;
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
    const cookbookId = typeof body?.cookbookId === "string" ? body.cookbookId : "";
    const avoidIds: string[] = Array.isArray(body?.avoidIds)
      ? body.avoidIds.filter((s: unknown) => typeof s === "string").slice(0, 50)
      : [];

    if (!cookbookId) {
      return new Response(
        JSON.stringify({ error: "Missing cookbookId" }),
        { status: 400, headers: jsonHeaders },
      );
    }

    // Fetch target cookbook (RLS enforces ownership)
    const { data: cookbook, error: cbErr } = await supabase
      .from("cookbooks")
      .select("id, name, description, emoji")
      .eq("id", cookbookId)
      .maybeSingle();

    if (cbErr || !cookbook) {
      return new Response(
        JSON.stringify({ error: "Cookbook not found" }),
        { status: 404, headers: jsonHeaders },
      );
    }

    // Existing recipe ids in this cookbook
    const { data: linkRows } = await supabase
      .from("cookbook_recipes")
      .select("recipe_id")
      .eq("cookbook_id", cookbookId);
    const existingIds = new Set(
      ((linkRows ?? []) as Array<{ recipe_id: string }>).map((r) => r.recipe_id),
    );
    for (const id of avoidIds) existingIds.add(id);

    // Candidate recipes: user's recipes not already in the cookbook
    let query = supabase
      .from("recipes")
      .select("id, title, ingredients, recipe_tags(tags(name))")
      .order("created_at", { ascending: false })
      .limit(MAX_CANDIDATES);

    if (existingIds.size > 0) {
      const list = Array.from(existingIds);
      query = query.not("id", "in", `(${list.join(",")})`);
    }

    const { data: recipesData, error: recipesErr } = await query;

    if (recipesErr) {
      console.error("[suggest-cookbook-additions] recipes fetch error", recipesErr);
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

    if (recipes.length < MIN_CANDIDATES) {
      return new Response(
        JSON.stringify({ suggestions: [], reason: "not_enough_candidates" }),
        { status: 200, headers: jsonHeaders },
      );
    }

    const candidateIds = new Set(recipes.map((r) => r.id));

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
      console.error("[suggest-cookbook-additions] GROQ_API_KEY not set");
      return new Response(
        JSON.stringify({ error: "AI not configured" }),
        { status: 500, headers: jsonHeaders },
      );
    }

    const raw = await askGroq(apiKey, cookbook, compactRecipes);
    const suggestions = validate(raw, candidateIds).slice(0, MAX_SUGGESTIONS);

    return new Response(
      JSON.stringify({
        suggestions,
        cookbook: { name: cookbook.name, emoji: cookbook.emoji },
      }),
      { status: 200, headers: jsonHeaders },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[suggest-cookbook-additions] Unhandled error: ${message}`);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: jsonHeaders },
    );
  }
});

async function askGroq(
  apiKey: string,
  cookbook: { name: string; description: string | null; emoji: string | null },
  recipes: Array<{ id: string; title: string; tags: string[]; key_ingredients: string[] }>,
): Promise<Suggestion[]> {
  const systemMessage = `You decide which of the user's recipes belong in a specific themed cookbook.

You receive:
- A cookbook (name, description, emoji) — the theme.
- A JSON array of candidate recipes (id, title, tags, key ingredients). None of these are currently in the cookbook.

Your job: return ONLY the recipes that clearly fit the cookbook's theme. Be selective. Prefer returning 0 matches over weak matches. Up to ${MAX_SUGGESTIONS} suggestions.

Rules:
- Use recipe ids exactly as given in the input. Never invent ids.
- "reason": one short sentence (<= ${REASON_MAX} chars) in plain Australian English explaining the fit.
- A recipe should fit by cuisine, occasion, method, season, or dietary pattern — match the cookbook's intent, not just a single shared ingredient.
- Return STRICT JSON only. No prose, no markdown, no code fences.

Output shape:
{
  "suggestions": [
    { "recipe_id": string, "reason": string }
  ]
}`;

  const userParts: string[] = [];
  userParts.push("Target cookbook:");
  userParts.push(JSON.stringify({
    name: cookbook.name,
    description: cookbook.description ?? "",
    emoji: cookbook.emoji ?? "",
  }));
  userParts.push("");
  userParts.push("Candidate recipes (not currently in the cookbook):");
  userParts.push(JSON.stringify(recipes));
  userParts.push("");
  userParts.push(`Return up to ${MAX_SUGGESTIONS} that clearly fit. Fewer is better than padded.`);

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
      temperature: 0.3,
    }),
  });

  if (!groqRes.ok) {
    const errText = await groqRes.text().catch(() => "");
    console.error(`[suggest-cookbook-additions] Groq API error (${groqRes.status}): ${errText.slice(0, 200)}`);
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
    console.error("[suggest-cookbook-additions] JSON parse failed", err);
    return [];
  }
}

function validate(raw: Suggestion[], candidateIds: Set<string>): Suggestion[] {
  const out: Suggestion[] = [];
  const seen = new Set<string>();
  for (const s of raw) {
    if (!s || typeof s !== "object") continue;
    const recipeId = typeof s.recipe_id === "string" ? s.recipe_id : "";
    if (!recipeId || !candidateIds.has(recipeId) || seen.has(recipeId)) continue;
    const reason = typeof s.reason === "string"
      ? s.reason.trim().slice(0, REASON_MAX)
      : "";
    seen.add(recipeId);
    out.push({ recipe_id: recipeId, reason });
  }
  return out;
}

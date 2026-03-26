import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";

const VALID_CATEGORIES = new Set([
  "Produce",
  "Meat & Seafood",
  "Dairy & Eggs",
  "Bakery",
  "Pantry & Dry Goods",
  "Canned & Jarred",
  "Frozen",
  "Condiments & Sauces",
  "Spices & Seasonings",
  "Drinks",
  "Other",
]);

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
    const { ingredients, existingCategories } = await req.json() as {
      ingredients: string[];
      existingCategories: Record<string, string>;
    };

    if (!Array.isArray(ingredients) || ingredients.length === 0) {
      return new Response(
        JSON.stringify({ categories: existingCategories ?? {} }),
        { status: 200, headers: corsHeaders },
      );
    }

    const apiKey = Deno.env.get("GROQ_API_KEY");
    if (!apiKey) {
      console.error("[categorise-ingredients] GROQ_API_KEY not set");
      return new Response(
        JSON.stringify({ categories: existingCategories ?? {} }),
        { status: 200, headers: corsHeaders },
      );
    }

    const itemNames = ingredients.join(", ");

    const groqRes = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          {
            role: "system",
            content: `You categorise grocery ingredients into shopping aisle categories.
Return ONLY a JSON object mapping each ingredient name (lowercase) to exactly one of these categories:
"Produce", "Meat & Seafood", "Dairy & Eggs", "Bakery", "Pantry & Dry Goods", "Canned & Jarred", "Frozen", "Condiments & Sauces", "Spices & Seasonings", "Drinks", "Other"

Example: {"chicken thighs": "Meat & Seafood", "brown onion": "Produce", "soy sauce": "Condiments & Sauces", "basmati rice": "Pantry & Dry Goods"}`,
          },
          {
            role: "user",
            content: `Categorise these ingredients: ${itemNames}`,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
      }),
    });

    if (!groqRes.ok) {
      console.error(`[categorise-ingredients] Groq API error (${groqRes.status})`);
      return new Response(
        JSON.stringify({ categories: existingCategories ?? {} }),
        { status: 200, headers: corsHeaders },
      );
    }

    const groqData = await groqRes.json();
    const content = groqData.choices?.[0]?.message?.content;

    if (!content) {
      return new Response(
        JSON.stringify({ categories: existingCategories ?? {} }),
        { status: 200, headers: corsHeaders },
      );
    }

    const parsed: Record<string, string> = JSON.parse(content);

    // Merge with existing categories, validate values
    const merged = { ...(existingCategories ?? {}) };
    for (const [key, value] of Object.entries(parsed)) {
      const normKey = key.toLowerCase().trim();
      merged[normKey] = VALID_CATEGORIES.has(value) ? value : "Other";
    }

    return new Response(
      JSON.stringify({ categories: merged }),
      { status: 200, headers: corsHeaders },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[categorise-ingredients] Unhandled error: ${message}`);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: corsHeaders },
    );
  }
});

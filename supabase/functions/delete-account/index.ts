import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, apikey, x-client-info",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function recipeImagePath(publicUrl: string): string | null {
  const marker = "/storage/v1/object/public/recipe-images/";
  const markerIndex = publicUrl.indexOf(marker);
  if (markerIndex === -1) return null;

  const path = publicUrl.slice(markerIndex + marker.length).split("?")[0];
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      console.error("[delete-account] Missing Supabase environment variables");
      return json({ error: "Account deletion is temporarily unavailable" }, 500);
    }

    // Resolve the caller from the signed JWT. The client never receives the
    // service-role credential used for the destructive operation below.
    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: authError,
    } = await caller.auth.getUser();
    if (authError || !user) return json({ error: "Not authenticated" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Recipe images live outside Postgres, so database cascades cannot remove
    // them. Delete only objects referenced by recipes owned by this account.
    const { data: recipes, error: recipeError } = await admin
      .from("recipes")
      .select("image_url")
      .eq("user_id", user.id);
    if (recipeError) {
      console.warn(`[delete-account] Could not list recipe images: ${recipeError.message}`);
    } else {
      const paths = Array.from(
        new Set(
          (recipes ?? [])
            .map((recipe) =>
              typeof recipe.image_url === "string"
                ? recipeImagePath(recipe.image_url)
                : null
            )
            .filter((path): path is string => Boolean(path)),
        ),
      );

      for (let i = 0; i < paths.length; i += 100) {
        const { error: storageError } = await admin.storage
          .from("recipe-images")
          .remove(paths.slice(i, i + 100));
        if (storageError) {
          // Do not trap a user in their account because cleanup of a public
          // recipe image failed. Log it so an orphan can be removed later.
          console.warn(`[delete-account] Image cleanup failed: ${storageError.message}`);
        }
      }
    }

    // Scan uploads are normally removed as soon as OCR finishes, but a user
    // can delete their account mid-import. The bucket is namespaced by user ID,
    // making it safe to clean up any abandoned objects here.
    const { data: scans, error: scanListError } = await admin.storage
      .from("recipe-scans")
      .list(user.id, { limit: 1000 });
    if (scanListError) {
      console.warn(`[delete-account] Scan cleanup list failed: ${scanListError.message}`);
    } else if (scans && scans.length > 0) {
      const { error: scanRemoveError } = await admin.storage
        .from("recipe-scans")
        .remove(scans.map((scan) => `${user.id}/${scan.name}`));
      if (scanRemoveError) {
        console.warn(`[delete-account] Scan cleanup failed: ${scanRemoveError.message}`);
      }
    }

    // ON DELETE CASCADE constraints remove the profile, recipes, cookbooks,
    // meal plans, invitations and family membership in the same operation.
    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) {
      console.error(`[delete-account] Auth deletion failed: ${deleteError.message}`);
      return json({ error: "We couldn't delete your account. Please try again." }, 500);
    }

    return json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[delete-account] Unhandled error: ${message}`);
    return json({ error: "We couldn't delete your account. Please try again." }, 500);
  }
});

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, apikey, x-client-info",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const headers = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    // Auth: get the calling user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization" }),
        { status: 401, headers },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Not authenticated" }),
        { status: 401, headers },
      );
    }

    // Parse input
    const { email } = await req.json();
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return new Response(
        JSON.stringify({ error: "A valid email address is required" }),
        { status: 400, headers },
      );
    }

    const trimmedEmail = email.trim().toLowerCase();

    // Can't invite yourself
    if (trimmedEmail === user.email?.toLowerCase()) {
      return new Response(
        JSON.stringify({ error: "You can't invite yourself" }),
        { status: 400, headers },
      );
    }

    // Use service role to look up inviter's name
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: profile } = await admin
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .single();

    const inviterName = profile?.display_name || user.email || "Someone";

    // Build sign-up link
    const appUrl = Deno.env.get("APP_URL") || "https://piekeeper.com";
    const signUpLink = `${appUrl}/login?signup=true&email=${encodeURIComponent(trimmedEmail)}`;

    // Send email via Resend
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (resendKey) {
      const emailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resendKey}`,
        },
        body: JSON.stringify({
          from: "Pie Keeper <noreply@app.piekeeper.com>",
          to: [trimmedEmail],
          subject: `${inviterName} thinks you'd love Pie Keeper`,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 16px;">
              <h2 style="color: #2d5016; margin-bottom: 8px;">You're invited!</h2>
              <p style="color: #333; font-size: 16px; line-height: 1.5;">
                <strong>${inviterName}</strong> thinks you'd love <strong>Pie Keeper</strong> – a simple way to save and organise recipes from anywhere on the web.
              </p>
              <p style="color: #666; font-size: 14px; line-height: 1.5;">
                Create a free account and start building your own recipe collection.
              </p>
              <a href="${signUpLink}" style="display: inline-block; background: #2d5016; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 16px 0;">
                Create your free account
              </a>
              <p style="color: #999; font-size: 12px; margin-top: 24px;">
                If you're not interested, you can safely ignore this email.
              </p>
            </div>
          `,
        }),
      });

      if (!emailRes.ok) {
        const body = await emailRes.text();
        console.error("[send-friend-invite] Resend error:", body);
      }
    } else {
      console.warn("[send-friend-invite] RESEND_API_KEY not set, skipping email");
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: resendKey
          ? `Invite sent to ${trimmedEmail}`
          : `Invite created. Share this link: ${signUpLink}`,
      }),
      { status: 200, headers },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[send-friend-invite] Unhandled error: ${message}`);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers },
    );
  }
});

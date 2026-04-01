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
    const { email, password, display_name, measurement_preference, invite_token } =
      await req.json();

    // Validate required fields
    if (!email || !password || !invite_token) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers },
      );
    }

    if (typeof password !== "string" || password.length < 6) {
      return new Response(
        JSON.stringify({ error: "Password must be at least 6 characters" }),
        { status: 400, headers },
      );
    }

    const trimmedEmail = email.trim().toLowerCase();

    // Use service role for admin operations
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Look up the invitation by token
    const { data: invitation, error: inviteErr } = await admin
      .from("family_invitations")
      .select("*")
      .eq("token", invite_token)
      .eq("status", "pending")
      .single();

    if (inviteErr || !invitation) {
      return new Response(
        JSON.stringify({ error: "Invite not found or already used" }),
        { status: 404, headers },
      );
    }

    // Check expiry
    if (new Date(invitation.expires_at) < new Date()) {
      await admin
        .from("family_invitations")
        .update({ status: "expired" })
        .eq("id", invitation.id);

      return new Response(
        JSON.stringify({ error: "This invite has expired. Ask the sender to send a new one." }),
        { status: 410, headers },
      );
    }

    // Verify email matches the invitation
    if (invitation.invited_email !== trimmedEmail) {
      return new Response(
        JSON.stringify({
          error: `This invite was sent to ${invitation.invited_email}. Please sign up with that email address.`,
        }),
        { status: 403, headers },
      );
    }

    // Create user with auto-confirmation (skips confirmation email)
    const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
      email: trimmedEmail,
      password,
      email_confirm: true,
      user_metadata: {
        display_name: (display_name || "").trim(),
        measurement_preference: measurement_preference || "metric",
      },
    });

    if (createErr) {
      console.error("[auto-confirm-invited-signup] Failed to create user:", createErr);
      return new Response(
        JSON.stringify({ error: createErr.message }),
        { status: 400, headers },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        user_id: newUser.user.id,
      }),
      { status: 200, headers },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[auto-confirm-invited-signup] Unhandled error: ${message}`);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers },
    );
  }
});

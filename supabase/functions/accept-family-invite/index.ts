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
    const { token, action } = await req.json();
    if (!token || typeof token !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing invite token" }),
        { status: 400, headers },
      );
    }

    // Use service role for admin operations (bypasses RLS)
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Look up the invitation
    const { data: invitation, error: inviteErr } = await admin
      .from("family_invitations")
      .select("*")
      .eq("token", token)
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

    // Preview mode: return invite details without accepting
    if (action === "preview") {
      const { data: inviterProfile } = await admin
        .from("profiles")
        .select("display_name")
        .eq("id", invitation.invited_by)
        .single();

      return new Response(
        JSON.stringify({
          inviter_name: inviterProfile?.display_name || "Someone",
          invited_email: invitation.invited_email,
          expires_at: invitation.expires_at,
        }),
        { status: 200, headers },
      );
    }

    // Check email matches
    if (invitation.invited_email !== user.email?.toLowerCase()) {
      return new Response(
        JSON.stringify({
          error: `This invite was sent to ${invitation.invited_email}. You're signed in as ${user.email}.`,
        }),
        { status: 403, headers },
      );
    }

    // Check user isn't already in a family group
    const { data: existingMember } = await admin
      .from("family_members")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (existingMember) {
      return new Response(
        JSON.stringify({
          error: "You're already in a family group. Leave it first to join another.",
        }),
        { status: 409, headers },
      );
    }

    // Add user to the family group
    const { error: memberErr } = await admin
      .from("family_members")
      .insert({
        group_id: invitation.group_id,
        user_id: user.id,
        role: "member",
      });

    if (memberErr) {
      console.error("[accept-family-invite] Failed to add member:", memberErr);
      return new Response(
        JSON.stringify({ error: "Failed to join family group" }),
        { status: 500, headers },
      );
    }

    // Mark invitation as accepted
    await admin
      .from("family_invitations")
      .update({ status: "accepted" })
      .eq("id", invitation.id);

    // Get group info for the response
    const { data: group } = await admin
      .from("family_groups")
      .select("name")
      .eq("id", invitation.group_id)
      .single();

    return new Response(
      JSON.stringify({
        success: true,
        group_name: group?.name || "My Family",
        message: "You've joined the family group! You can now see shared recipes.",
      }),
      { status: 200, headers },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[accept-family-invite] Unhandled error: ${message}`);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers },
    );
  }
});

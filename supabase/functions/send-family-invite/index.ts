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

    // Use service role for admin operations
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Find or create the user's family group
    const { data: existingMember } = await admin
      .from("family_members")
      .select("group_id, role")
      .eq("user_id", user.id)
      .single();

    let groupId: string;

    if (existingMember) {
      if (existingMember.role !== "owner") {
        return new Response(
          JSON.stringify({ error: "Only the group owner can send invites" }),
          { status: 403, headers },
        );
      }
      groupId = existingMember.group_id;
    } else {
      // Auto-create a family group with this user as owner
      const { data: newGroup, error: groupErr } = await admin
        .from("family_groups")
        .insert({ created_by: user.id })
        .select("id")
        .single();

      if (groupErr || !newGroup) {
        console.error("[send-family-invite] Failed to create group:", groupErr);
        return new Response(
          JSON.stringify({ error: "Failed to create family group" }),
          { status: 500, headers },
        );
      }

      groupId = newGroup.id;

      // Add the creator as owner
      await admin.from("family_members").insert({
        group_id: groupId,
        user_id: user.id,
        role: "owner",
      });
    }

    // Check invitee isn't already a member
    const { data: allMembers } = await admin
      .from("family_members")
      .select("user_id")
      .eq("group_id", groupId);

    if (allMembers && allMembers.length > 0) {
      // Look up emails for existing members
      for (const member of allMembers) {
        const { data: memberUser } = await admin.auth.admin.getUserById(
          member.user_id,
        );
        if (memberUser?.user?.email?.toLowerCase() === trimmedEmail) {
          return new Response(
            JSON.stringify({ error: "This person is already in your family group" }),
            { status: 409, headers },
          );
        }
      }
    }

    // Check for existing pending invite to this email
    const { data: existingInvite } = await admin
      .from("family_invitations")
      .select("id")
      .eq("group_id", groupId)
      .eq("invited_email", trimmedEmail)
      .eq("status", "pending")
      .single();

    if (existingInvite) {
      return new Response(
        JSON.stringify({ error: "An invite has already been sent to this email" }),
        { status: 409, headers },
      );
    }

    // Create the invitation
    const { data: invitation, error: inviteErr } = await admin
      .from("family_invitations")
      .insert({
        group_id: groupId,
        invited_by: user.id,
        invited_email: trimmedEmail,
      })
      .select("id, token")
      .single();

    if (inviteErr || !invitation) {
      console.error("[send-family-invite] Failed to create invitation:", inviteErr);
      return new Response(
        JSON.stringify({ error: "Failed to create invitation" }),
        { status: 500, headers },
      );
    }

    // Get inviter's display name
    const { data: profile } = await admin
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .single();

    const inviterName = profile?.display_name || user.email || "Someone";

    // Build invite link
    const appUrl = Deno.env.get("APP_URL") || "https://piekeeper.com";
    const inviteLink = `${appUrl}/invite?token=${invitation.token}&email=${encodeURIComponent(trimmedEmail)}`;

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
          subject: `${inviterName} invited you to share recipes on Pie Keeper`,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 16px;">
              <h2 style="color: #2d5016; margin-bottom: 8px;">You're invited!</h2>
              <p style="color: #333; font-size: 16px; line-height: 1.5;">
                <strong>${inviterName}</strong> wants to share their recipes with you on Pie Keeper.
              </p>
              <p style="color: #666; font-size: 14px; line-height: 1.5;">
                Accept the invite and you'll both be able to see, edit, and organise each other's recipes.
              </p>
              <a href="${inviteLink}" style="display: inline-block; background: #2d5016; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 16px 0;">
                Accept invite
              </a>
              <p style="color: #999; font-size: 12px; margin-top: 24px;">
                This invite expires in 7 days. If you don't have a Pie Keeper account yet, you'll be able to create one.
              </p>
            </div>
          `,
        }),
      });

      if (!emailRes.ok) {
        const body = await emailRes.text();
        console.error("[send-family-invite] Resend error:", body);
        // Don't fail – the invite is created, user can share the link manually
      }
    } else {
      console.warn("[send-family-invite] RESEND_API_KEY not set, skipping email");
    }

    return new Response(
      JSON.stringify({
        success: true,
        invite_link: inviteLink,
        message: resendKey
          ? `Invite sent to ${trimmedEmail}`
          : `Invite created. Share this link: ${inviteLink}`,
      }),
      { status: 200, headers },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[send-family-invite] Unhandled error: ${message}`);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers },
    );
  }
});

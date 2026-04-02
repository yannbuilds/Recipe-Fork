import "jsr:@supabase/functions-js/edge-runtime.d.ts";

interface AuthEmailPayload {
  user: {
    id: string;
    email: string;
    user_metadata?: Record<string, unknown>;
  };
  email_data: {
    token: string;
    token_hash: string;
    redirect_to: string;
    email_action_type: "signup" | "recovery" | "email_change" | "magiclink";
    site_url: string;
    token_new?: string;
    token_hash_new?: string;
  };
}

const EMAIL_FROM = "Pie Keeper <noreply@app.piekeeper.com>";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

function buildVerifyUrl(tokenHash: string, type: string, redirectTo: string): string {
  return `${SUPABASE_URL}/auth/v1/verify?token=${tokenHash}&type=${type}&redirect_to=${encodeURIComponent(redirectTo)}`;
}

function buildEmail(payload: AuthEmailPayload): { subject: string; html: string } | null {
  const { email_data } = payload;
  const displayName = (payload.user.user_metadata?.display_name as string) || "";
  const greeting = displayName ? `Hi ${displayName},` : "Hi,";

  switch (email_data.email_action_type) {
    case "signup": {
      const confirmUrl = buildVerifyUrl(email_data.token_hash, "signup", email_data.redirect_to || email_data.site_url);
      return {
        subject: "Confirm your Pie Keeper account",
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 16px;">
            <h2 style="color: #2d5016; margin-bottom: 8px;">Welcome to Pie Keeper!</h2>
            <p style="color: #333; font-size: 16px; line-height: 1.5;">
              ${greeting} thanks for signing up. Please confirm your email to get started.
            </p>
            <a href="${confirmUrl}" style="display: inline-block; background: #2d5016; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 16px 0;">
              Confirm email
            </a>
            <p style="color: #999; font-size: 12px; margin-top: 24px;">
              If you didn't create this account, you can safely ignore this email.
            </p>
          </div>
        `,
      };
    }

    case "recovery": {
      const resetUrl = buildVerifyUrl(email_data.token_hash, "recovery", email_data.redirect_to || email_data.site_url);
      return {
        subject: "Reset your Pie Keeper password",
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 16px;">
            <h2 style="color: #2d5016; margin-bottom: 8px;">Password reset</h2>
            <p style="color: #333; font-size: 16px; line-height: 1.5;">
              ${greeting} we received a request to reset your password.
            </p>
            <a href="${resetUrl}" style="display: inline-block; background: #2d5016; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 16px 0;">
              Reset password
            </a>
            <p style="color: #999; font-size: 12px; margin-top: 24px;">
              If you didn't request this, you can safely ignore this email.
            </p>
          </div>
        `,
      };
    }

    case "email_change": {
      const changeUrl = buildVerifyUrl(email_data.token_hash, "email_change", email_data.redirect_to || email_data.site_url);
      return {
        subject: "Confirm your new email address",
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 16px;">
            <h2 style="color: #2d5016; margin-bottom: 8px;">Email change</h2>
            <p style="color: #333; font-size: 16px; line-height: 1.5;">
              ${greeting} please confirm your new email address.
            </p>
            <a href="${changeUrl}" style="display: inline-block; background: #2d5016; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 16px 0;">
              Confirm email change
            </a>
            <p style="color: #999; font-size: 12px; margin-top: 24px;">
              If you didn't request this change, please secure your account.
            </p>
          </div>
        `,
      };
    }

    case "magiclink": {
      const magicUrl = buildVerifyUrl(email_data.token_hash, "magiclink", email_data.redirect_to || email_data.site_url);
      return {
        subject: "Your Pie Keeper sign-in link",
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 16px;">
            <h2 style="color: #2d5016; margin-bottom: 8px;">Sign in to Pie Keeper</h2>
            <p style="color: #333; font-size: 16px; line-height: 1.5;">
              ${greeting} click the link below to sign in.
            </p>
            <a href="${magicUrl}" style="display: inline-block; background: #2d5016; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 16px 0;">
              Sign in
            </a>
            <p style="color: #999; font-size: 12px; margin-top: 24px;">
              If you didn't request this, you can safely ignore this email.
            </p>
          </div>
        `,
      };
    }

    default:
      return null;
  }
}

Deno.serve(async (req) => {
  try {
    const payload: AuthEmailPayload = await req.json();
    const { user, email_data } = payload;

    console.log(`[send-auth-email] type=${email_data.email_action_type} to=${user.email}`);

    const email = buildEmail(payload);
    if (!email) {
      console.warn(`[send-auth-email] Unhandled email type: ${email_data.email_action_type}`);
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      console.error("[send-auth-email] RESEND_API_KEY not set — returning 200 to avoid blocking auth");
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [user.email],
        subject: email.subject,
        html: email.html,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`[send-auth-email] Resend error (${res.status}):`, body);
      // Return 200 anyway — auth hooks must not block the auth operation
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    console.log(`[send-auth-email] Sent ${email_data.email_action_type} email to ${user.email}`);
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[send-auth-email] Error: ${message}`);
    // Return 200 anyway — auth hooks must not block the auth operation
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
});

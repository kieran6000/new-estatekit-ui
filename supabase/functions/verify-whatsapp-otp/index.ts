import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const DEV_BYPASS_PHONE = "+10000000000";
const DEV_BYPASS_CODE = "0000";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

function phoneToEmail(phone: string): string {
  return phone.replace(/\+/g, "") + "@phone.estatekit.co";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phone, code } = await req.json();
    if (!phone || !code) {
      return new Response(JSON.stringify({ error: "Phone and code are required" }), { status: 400, headers: corsHeaders });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1. Verify OTP code
    if (phone === DEV_BYPASS_PHONE) {
      if (code !== DEV_BYPASS_CODE) {
        return new Response(JSON.stringify({ error: "Invalid code" }), { status: 400, headers: corsHeaders });
      }
    } else {
      const { data: storedRow } = await admin
        .from("otp_codes")
        .select("code")
        .eq("phone", phone)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!storedRow || storedRow.code !== code) {
        return new Response(JSON.stringify({ error: "Invalid or expired code" }), { status: 400, headers: corsHeaders });
      }
      await admin.from("otp_codes").delete().eq("phone", phone);
    }

    // 2. Find or create user
    const { data: existingId } = await admin.rpc("find_user_id_by_phone", { p_phone: phone });
    let userId = existingId;
    const syntheticEmail = phoneToEmail(phone);

    if (!userId) {
      const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
        email: syntheticEmail,
        phone: phone,
        phone_confirm: true,
        email_confirm: true,
        user_metadata: { phone_login: true },
      });
      if (createErr) {
        return new Response(JSON.stringify({ error: "Could not create account: " + createErr.message }), { status: 500, headers: corsHeaders });
      }
      userId = newUser.user.id;

      const isDevUser = phone === DEV_BYPASS_PHONE;
      await admin.from("agent_profiles").upsert({
        agent_id: userId,
        display_name: "Agent",
        whatsapp_number: phone,
        is_operator: isDevUser,
        tier: isDevUser ? "paid" : "free",
      }, { onConflict: "agent_id" });
    }

    // 3. Ensure user has a confirmed email for magic link flow
    const { data: { user: fullUser } } = await admin.auth.admin.getUserById(userId);
    if (!fullUser) {
      return new Response(JSON.stringify({ error: "User not found" }), { status: 500, headers: corsHeaders });
    }
    const userEmail = fullUser.email || syntheticEmail;
    if (!fullUser.email) {
      await admin.auth.admin.updateUser(userId, { email: syntheticEmail, email_confirm: true });
    }

    // 4. Generate magic link (admin API, no email sent)
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: userEmail,
    });
    if (linkErr || !linkData) {
      return new Response(JSON.stringify({ error: "Auth link failed: " + (linkErr?.message || "unknown") }), { status: 500, headers: corsHeaders });
    }

    const hashedToken = linkData.properties?.hashed_token;
    if (!hashedToken) {
      return new Response(JSON.stringify({ error: "No token generated" }), { status: 500, headers: corsHeaders });
    }

    // 5. Exchange the token for a real session using anon client
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: verifyData, error: verifyErr } = await anonClient.auth.verifyOtp({
      token_hash: hashedToken,
      type: "magiclink",
    });
    if (verifyErr || !verifyData?.session) {
      return new Response(JSON.stringify({ error: "Session creation failed: " + (verifyErr?.message || "no session") }), { status: 500, headers: corsHeaders });
    }

    return new Response(JSON.stringify({
      access_token: verifyData.session.access_token,
      refresh_token: verifyData.session.refresh_token,
      user: { id: userId, phone },
    }), { headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Server error: " + (err?.message || String(err)) }), { status: 500, headers: corsHeaders });
  }
});

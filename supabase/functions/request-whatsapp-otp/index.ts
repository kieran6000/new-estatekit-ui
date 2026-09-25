import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DEV_BYPASS_PHONE = "+10000000000";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

function generate4DigitCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phone } = await req.json();
    if (!phone) {
      return new Response(JSON.stringify({ error: "phone required" }), { status: 400, headers: corsHeaders });
    }

    // Dev bypass — no OTP needed
    if (phone === DEV_BYPASS_PHONE) {
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    const code = generate4DigitCode();

    // Store OTP in database
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Delete old codes for this phone
    await admin.from("otp_codes").delete().eq("phone", phone);

    // Insert new code
    const { error: insertErr } = await admin.from("otp_codes").insert({
      phone,
      code,
      created_at: new Date().toISOString(),
    });
    if (insertErr) {
      return new Response(JSON.stringify({ error: insertErr.message }), { status: 500, headers: corsHeaders });
    }

    // Send via TextMeBot WhatsApp API
    const TEXTMEBOT_KEY = Deno.env.get("TEXTMEBOT_API_KEY");
    if (TEXTMEBOT_KEY) {
      const digits = phone.replace(/[^0-9]/g, "");
      const msg = `Your EstateKit code is: ${code}`;
      await fetch(
        `https://api.textmebot.com/send.php?recipient=${digits}&apikey=${TEXTMEBOT_KEY}&text=${encodeURIComponent(msg)}`
      );
    }

    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});

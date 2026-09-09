import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Pauses or resumes a single Facebook ad. Operator action from the dashboard —
// it changes live ad delivery (and therefore spend), so the UI confirms first.

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
};

const GRAPH = "https://graph.facebook.com/v21.0";
const TOKEN_NAMES = ["FB_ACCESS_TOKEN", "FB_ACCESS_TOKEN_2"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    const { adId, status } = await req.json();
    if (!adId) return json({ error: "adId required" }, 400);
    if (status !== "ACTIVE" && status !== "PAUSED") return json({ error: "status must be ACTIVE or PAUSED" }, 400);

    const tokens: string[] = [];
    for (const name of TOKEN_NAMES) {
      const { data } = await supabase.rpc("get_secret", { secret_name: name });
      if (data) tokens.push(data);
    }
    if (tokens.length === 0) return json({ error: "No FB token configured" }, 500);

    let lastErr = "";
    for (const token of tokens) {
      const res = await fetch(`${GRAPH}/${adId}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ status, access_token: token }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        lastErr = data.error?.message || `HTTP ${res.status}`;
        continue;
      }
      return json({ ok: true, status });
    }

    console.warn("fb-set-ad-status: all tokens failed:", lastErr);
    return json({ error: lastErr || "Could not update ad" }, 502);
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

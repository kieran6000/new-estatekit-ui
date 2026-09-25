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

const digits = (s: string | null | undefined) => String(s ?? "").replace(/^act_/, "").trim();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    // This function changes live spend on every client's ads and used to accept
    // any caller: it runs with JWT verification off and never checked who was
    // asking. Now the caller must be signed in, and is either an operator or
    // the agent whose ad account the ad belongs to.
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: userData } = jwt ? await supabase.auth.getUser(jwt) : { data: null };
    const uid = userData?.user?.id;
    if (!uid) return json({ error: "Not signed in" }, 401);
    const { data: me } = await supabase
      .from("agent_profiles").select("is_operator, fb_ad_account_id").eq("agent_id", uid).maybeSingle();
    const isOperator = me?.is_operator === true;
    const ownAccount = digits(me?.fb_ad_account_id);
    if (!isOperator && !ownAccount) return json({ error: "Not allowed" }, 403);

    const { adId, status } = await req.json();
    // Digits only: adId goes into a Graph path, so anything else could address
    // a different object or edge.
    if (!adId || !/^\d+$/.test(String(adId))) return json({ error: "adId required" }, 400);
    if (status !== "ACTIVE" && status !== "PAUSED") return json({ error: "status must be ACTIVE or PAUSED" }, 400);

    const tokens: string[] = [];
    for (const name of TOKEN_NAMES) {
      const { data } = await supabase.rpc("get_secret", { secret_name: name });
      if (data) tokens.push(data);
    }
    if (tokens.length === 0) return json({ error: "No FB token configured" }, 500);

    let lastErr = "";
    for (const token of tokens) {
      if (!isOperator) {
        const owner = await fetch(`${GRAPH}/${encodeURIComponent(adId)}?fields=account_id&access_token=${token}`);
        const ownerData = await owner.json();
        if (!owner.ok || ownerData.error) {
          lastErr = ownerData.error?.message || `HTTP ${owner.status}`;
          continue;
        }
        if (digits(ownerData.account_id) !== ownAccount) return json({ error: "Not allowed" }, 403);
      }
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

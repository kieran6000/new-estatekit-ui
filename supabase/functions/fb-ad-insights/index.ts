import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

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

/**
 * Who's calling, read from their token. The gateway (verify_jwt) has already
 * checked its signature and expiry, the same check the database makes.
 * auth.getUser() also needs the login session to still exist on the auth
 * server, so a staff member whose session ended elsewhere was refused here
 * while the rest of the dashboard kept working.
 */
function userIdFrom(jwt: string): string | null {
  try {
    const part = jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const p = JSON.parse(atob(part + "===".slice((part.length + 3) % 4)));
    return p.role === "authenticated" && typeof p.sub === "string" ? p.sub : null;
  } catch {
    return null;
  }
}

/**
 * Only an operator, or the agent who owns this ad account, may read it.
 * The gateway checks the token (verify_jwt), but the public anon key would
 * pass that check too, so without this any caller could read any ad
 * account our Facebook tokens can see: ads, spend, balance, funding.
 */
async function mayReadAccount(req: Request, adAccountId: string): Promise<boolean> {
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return false;
  const uid = userIdFrom(jwt);
  if (!uid) return false;
  const { data: me } = await supabase
    .from("agent_profiles").select("is_operator, fb_ad_account_id").eq("agent_id", uid).maybeSingle();
  if (me?.is_operator === true) return true;
  const own = String(me?.fb_ad_account_id ?? "").replace(/^act_/, "").trim();
  return own !== "" && own === String(adAccountId).replace(/^act_/, "").trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    const { adAccountId, since } = await req.json();
    if (!adAccountId) return json({ error: "adAccountId required" }, 400);
    if (!(await mayReadAccount(req, String(adAccountId)))) return json({ error: "Not allowed" }, 403);
    const actId = String(adAccountId).startsWith("act_") ? String(adAccountId) : `act_${adAccountId}`;

    const tokens: string[] = [];
    for (const name of TOKEN_NAMES) {
      const { data } = await supabase.rpc("get_secret", { secret_name: name });
      if (data) tokens.push(data);
    }
    // Same graceful shape as the all-tokens-failed path below. A 500 here makes
    // the Overview query throw, and React Query then refetches it on every
    // window focus. The deployed version already did this; the repo hadn't.
    if (tokens.length === 0) return json({ daily: {}, note: "No FB token configured" });

    const today = new Date().toISOString().slice(0, 10);
    // since provided → use an explicit range; otherwise pull the max window.
    const timeParam = since
      ? `time_range=${encodeURIComponent(JSON.stringify({ since, until: today }))}`
      : `date_preset=maximum`;

    let lastErr = "";
    for (const token of tokens) {
      const daily: Record<string, number> = {};
      let url: string | null =
        `${GRAPH}/${actId}/insights?fields=spend&time_increment=1&${timeParam}&limit=500&access_token=${token}`;
      let ok = true;
      while (url) {
        const res = await fetch(url);
        const data = await res.json();
        if (!res.ok || data.error) { ok = false; lastErr = data.error?.message || `HTTP ${res.status}`; break; }
        for (const row of data.data || []) {
          if (row.date_start) daily[row.date_start] = Number(row.spend || 0);
        }
        url = data.paging?.next ?? null;
      }
      if (ok) return json({ daily });
    }
    // Degrade gracefully: no spend data (e.g. account owner hasn't granted
    // ads_read). The dashboard just shows no ad spend rather than erroring.
    console.warn("fb-ad-insights: all tokens failed:", lastErr);
    return json({ daily: {}, note: lastErr });
  } catch (err) {
    return json({ daily: {}, note: String(err) });
  }
});

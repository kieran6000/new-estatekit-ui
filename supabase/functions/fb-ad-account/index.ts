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
 * Only an operator, or the agent who owns this ad account, may read it.
 * This function runs with JWT verification off (and the public anon key would
 * pass that check anyway), so without this any caller could read any ad
 * account our Facebook tokens can see: ads, spend, balance, funding.
 */
async function mayReadAccount(req: Request, adAccountId: string): Promise<boolean> {
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return false;
  const { data } = await supabase.auth.getUser(jwt);
  const uid = data?.user?.id;
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
    const { adAccountId } = await req.json();
    if (!adAccountId) return json({ error: "adAccountId required" }, 400);
    if (!(await mayReadAccount(req, String(adAccountId)))) return json({ error: "Not allowed" }, 403);
    const actId = String(adAccountId).startsWith("act_") ? String(adAccountId) : `act_${adAccountId}`;

    const tokens: string[] = [];
    for (const name of TOKEN_NAMES) {
      const { data } = await supabase.rpc("get_secret", { secret_name: name });
      if (data) tokens.push(data);
    }
    if (tokens.length === 0) return json({ error: "No FB token configured" }, 500);

    const fields = "balance,amount_spent,spend_cap,currency,name,account_status,funding_source_details";
    let lastErr = "";
    for (const token of tokens) {
      const res = await fetch(`${GRAPH}/${actId}?fields=${fields}&access_token=${token}`);
      const data = await res.json();
      if (res.ok && !data.error) {
        // Amounts come back in minor units (cents) of the account currency.
        const toMajor = (v: string | undefined) => (v == null ? null : Number(v) / 100);
        const funding = data.funding_source_details as { type?: string; display_string?: string } | undefined;
        return json({
          currency: data.currency ?? "ZAR",
          balance: toMajor(data.balance),
          amountSpent: toMajor(data.amount_spent),
          spendCap: toMajor(data.spend_cap),
          name: data.name ?? null,
          accountStatus: data.account_status ?? null,
          // e.g. "Visa •••• 1234" for a card, or the wallet/prepaid label Meta gives it.
          fundingLabel: funding?.display_string ?? null,
          fundingType: funding?.type ?? null,
        });
      }
      lastErr = data.error?.message || `HTTP ${res.status}`;
    }
    // Degrade gracefully: return empty figures + a note so the UI can show a
    // "no access" state instead of erroring. Common cause: the ad account
    // owner hasn't granted the app ads_read/ads_management.
    console.warn("fb-ad-account: all tokens failed:", lastErr);
    return json({ currency: "ZAR", balance: null, amountSpent: null, spendCap: null, name: null, accountStatus: null, fundingLabel: null, fundingType: null, note: lastErr });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

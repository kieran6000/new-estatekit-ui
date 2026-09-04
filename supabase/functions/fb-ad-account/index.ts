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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    const { adAccountId } = await req.json();
    if (!adAccountId) return json({ error: "adAccountId required" }, 400);
    const actId = String(adAccountId).startsWith("act_") ? String(adAccountId) : `act_${adAccountId}`;

    const tokens: string[] = [];
    for (const name of TOKEN_NAMES) {
      const { data } = await supabase.rpc("get_secret", { secret_name: name });
      if (data) tokens.push(data);
    }
    if (tokens.length === 0) return json({ error: "No FB token configured" }, 500);

    const fields = "balance,amount_spent,spend_cap,currency,name,account_status";
    let lastErr = "";
    for (const token of tokens) {
      const res = await fetch(`${GRAPH}/${actId}?fields=${fields}&access_token=${token}`);
      const data = await res.json();
      if (res.ok && !data.error) {
        // Amounts come back in minor units (cents) of the account currency.
        const toMajor = (v: string | undefined) => (v == null ? null : Number(v) / 100);
        return json({
          currency: data.currency ?? "ZAR",
          balance: toMajor(data.balance),
          amountSpent: toMajor(data.amount_spent),
          spendCap: toMajor(data.spend_cap),
          name: data.name ?? null,
          accountStatus: data.account_status ?? null,
        });
      }
      lastErr = data.error?.message || `HTTP ${res.status}`;
    }
    return json({ error: lastErr || "Could not load ad account" }, 502);
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

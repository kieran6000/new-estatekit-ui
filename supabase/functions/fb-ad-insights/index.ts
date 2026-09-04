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
    const { adAccountId, since } = await req.json();
    if (!adAccountId) return json({ error: "adAccountId required" }, 400);
    const actId = String(adAccountId).startsWith("act_") ? String(adAccountId) : `act_${adAccountId}`;

    const tokens: string[] = [];
    for (const name of TOKEN_NAMES) {
      const { data } = await supabase.rpc("get_secret", { secret_name: name });
      if (data) tokens.push(data);
    }
    if (tokens.length === 0) return json({ error: "No FB token configured" }, 500);

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
    return json({ error: lastErr || "Could not load insights" }, 502);
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

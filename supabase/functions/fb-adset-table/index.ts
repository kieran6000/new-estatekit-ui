import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// The client page's "Ad sets & ads" table: one row per ad set (or ad) that
// is on, or spent in the dates, with the numbers the media buyer reads:
// spend, leads, impressions, link clicks, landing-page views, frequency.
// One Graph call (insights expanded on the edge), so it's light on quota.

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
};
const GRAPH = "https://graph.facebook.com/v21.0";
const TOKEN_NAMES = ["FB_ACCESS_TOKEN", "FB_ACCESS_TOKEN_2"];
// Facebook's throttling codes: stop and say so, never retry here.
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

type Action = { action_type: string; value: string };
// Same as fb-active-ads: one canonical lead type, never a sum (they repeat).
const LEAD_ACTION_PRIORITY = ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead", "leadgen.other"];
function leadsFrom(actions: Action[] | undefined): number {
  if (!actions) return 0;
  for (const type of LEAD_ACTION_PRIORITY) {
    const m = actions.find((a) => a.action_type === type);
    if (m) return Number(m.value) || 0;
  }
  return 0;
}
const actionValue = (actions: Action[] | undefined, type: string) => Number(actions?.find((a) => a.action_type === type)?.value) || 0;

function userIdFrom(jwt: string): string | null {
  try {
    const part = jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const p = JSON.parse(atob(part + "===".slice((part.length + 3) % 4)));
    return p.role === "authenticated" && typeof p.sub === "string" ? p.sub : null;
  } catch {
    return null;
  }
}

/** Only an operator, or the agent who owns this ad account (as fb-active-ads). */
async function mayReadAccount(req: Request, adAccountId: string): Promise<boolean> {
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const uid = jwt ? userIdFrom(jwt) : null;
  if (!uid) return false;
  const { data: me } = await supabase.from("agent_profiles").select("is_operator, fb_ad_account_id").eq("agent_id", uid).maybeSingle();
  if (me?.is_operator === true) return true;
  const own = String(me?.fb_ad_account_id ?? "").replace(/^act_/, "").trim();
  return own !== "" && own === String(adAccountId).replace(/^act_/, "").trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    const { adAccountId, since, until, level } = await req.json();
    if (!adAccountId || !since || !until) return json({ error: "adAccountId, since and until required" }, 400);
    if (!(await mayReadAccount(req, String(adAccountId)))) return json({ error: "Not allowed" }, 403);
    const actId = String(adAccountId).startsWith("act_") ? String(adAccountId) : `act_${adAccountId}`;
    const edge = level === "ad" ? "ads" : "adsets";

    const tokens: string[] = [];
    for (const name of TOKEN_NAMES) {
      const { data } = await supabase.rpc("get_secret", { secret_name: name });
      if (data) tokens.push(data);
    }
    if (!tokens.length) return json({ rows: [], note: "No Facebook token configured" });

    const insights = `insights.time_range(${JSON.stringify({ since, until })}){spend,impressions,inline_link_clicks,frequency,actions}`;
    const fields = ["id", "name", "effective_status", "created_time", ...(edge === "ads" ? ["adset{name}"] : []), insights].join(",");
    const filter = encodeURIComponent(JSON.stringify([{ field: "effective_status", operator: "IN", value: ["ACTIVE", "PAUSED", "CAMPAIGN_PAUSED", "ADSET_PAUSED"] }]));

    let lastErr = "";
    for (const token of tokens) {
      const res = await fetch(`${GRAPH}/${actId}/${edge}?fields=${fields}&filtering=${filter}&limit=200&access_token=${token}`);
      const data = await res.json();
      if (data.error) {
        if (RATE_LIMIT_CODES.has(Number(data.error.code))) return json({ rows: [], note: "busy" });
        lastErr = data.error.message || "error";
        continue;
      }
      // deno-lint-ignore no-explicit-any
      const rows = (data.data || []).map((e: any) => {
        const i = e.insights?.data?.[0] ?? {};
        return {
          id: e.id,
          name: e.name,
          adset: e.adset?.name ?? null,
          status: e.effective_status,
          created: e.created_time,
          spend: Number(i.spend) || 0,
          impressions: Number(i.impressions) || 0,
          clicks: Number(i.inline_link_clicks) || 0,
          frequency: Number(i.frequency) || 0,
          leads: leadsFrom(i.actions),
          lpv: actionValue(i.actions, "landing_page_view"),
        };
      })
        // On now, or spent in these dates.
        // deno-lint-ignore no-explicit-any
        .filter((r: any) => r.status === "ACTIVE" || r.spend > 0);
      return json({ rows });
    }
    console.warn("fb-adset-table: all tokens failed:", lastErr);
    return json({ rows: [], note: lastErr });
  } catch (err) {
    return json({ rows: [], note: String(err) });
  }
});

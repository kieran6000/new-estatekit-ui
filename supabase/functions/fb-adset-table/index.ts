import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// The client page's ads table, like Ads Manager: campaigns, ad sets or ads
// (optionally inside one campaign or ad set), each with Facebook's own
// numbers for the dates; ads also bring their creative for the preview. At
// campaign level with no filter it adds the ad account's totals (the tiles).
// One Graph call per view (insights expanded on the edge).

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
  return leadResult(actions).leads;
}
// Ads Manager's name for the result under the number: "Leads (Form)" etc.
const RESULT_NAME: Record<string, string> = { lead: "Leads", "onsite_conversion.lead_grouped": "Leads (Form)", "offsite_conversion.fb_pixel_lead": "Website leads", "leadgen.other": "Leads (Form)" };
function leadResult(actions: Action[] | undefined): { leads: number; resultType: string } {
  if (!actions) return { leads: 0, resultType: "" };
  // Form leads are named as forms even when the generic "lead" is there too.
  const form = actions.find((a) => a.action_type === "onsite_conversion.lead_grouped");
  for (const type of LEAD_ACTION_PRIORITY) {
    const m = actions.find((a) => a.action_type === type);
    if (m) return { leads: Number(m.value) || 0, resultType: form ? "Leads (Form)" : RESULT_NAME[type] };
  }
  return { leads: 0, resultType: "" };
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

const INSIGHT_FIELDS = "spend,impressions,reach,frequency,inline_link_clicks,actions";

const BOOKED = ["Booked", "Viewing Booked", "Mandate Signed"];
const MANDATE = "Mandate Signed";

/** EstateKit's own results per campaign, ad set or ad: of the leads that came
 *  from its ads in these dates, how many were booked and how many signed a
 *  mandate (ever, so a lead from March booked in April still counts for
 *  March's ad). Leads are tied to an ad by fb_ad_id; ads to their ad set and
 *  campaign by asking Facebook. */
async function ekResults(actId: string, since: string, until: string, lvl: "campaign" | "adset" | "ad", token: string) {
  const out: Record<string, { booked: number; mandates: number }> = {};
  const bare = actId.replace(/^act_/, "");
  const { data: owners } = await supabase.from("agent_profiles").select("agent_id").in("fb_ad_account_id", [bare, actId]);
  const agentIds = (owners ?? []).map((o: { agent_id: string }) => o.agent_id);
  if (!agentIds.length) return out;
  const end = new Date(`${until}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 1);
  const { data: leads } = await supabase.from("leads").select("id, fb_ad_id, stage")
    .in("agent_id", agentIds).not("fb_ad_id", "is", null)
    .gte("created_at", `${since}T00:00:00Z`).lt("created_at", end.toISOString())
    .range(0, 9999);
  if (!leads?.length) return out;

  // Booked or signed: by the stage it's in now, or any move into one.
  const booked = new Set<string>(), signed = new Set<string>();
  for (const l of leads) {
    if (BOOKED.includes(l.stage)) booked.add(l.id);
    if (l.stage === MANDATE) signed.add(l.id);
  }
  const ids = leads.map((l: { id: string }) => l.id);
  for (let i = 0; i < ids.length; i += 300) {
    const { data: ev } = await supabase.from("lead_events").select("lead_id, to_value")
      .in("lead_id", ids.slice(i, i + 300)).eq("event_type", "stage_changed").in("to_value", BOOKED);
    for (const e of ev ?? []) { booked.add(e.lead_id); if (e.to_value === MANDATE) signed.add(e.lead_id); }
  }

  // Which row each ad belongs to.
  const adIds = [...new Set(leads.map((l: { fb_ad_id: string }) => String(l.fb_ad_id)))].filter((x) => /^\d+$/.test(x));
  const rowOf: Record<string, string> = {};
  if (lvl === "ad") for (const a of adIds) rowOf[a] = a;
  else {
    for (let i = 0; i < adIds.length; i += 50) {
      const r = await (await fetch(`${GRAPH}/?ids=${adIds.slice(i, i + 50).join(",")}&fields=adset_id,campaign_id&access_token=${token}`)).json();
      if (r.error) continue;
      for (const [id, v] of Object.entries(r as Record<string, { adset_id?: string; campaign_id?: string }>)) {
        const row = lvl === "adset" ? v.adset_id : v.campaign_id;
        if (row) rowOf[id] = String(row);
      }
    }
  }
  for (const l of leads) {
    const row = rowOf[String(l.fb_ad_id)];
    if (!row) continue;
    const o = (out[row] ??= { booked: 0, mandates: 0 });
    if (booked.has(l.id)) o.booked++;
    if (signed.has(l.id)) o.mandates++;
  }
  return out;
}
// deno-lint-ignore no-explicit-any
function numbers(i: any) {
  return {
    spend: Number(i?.spend) || 0,
    impressions: Number(i?.impressions) || 0,
    reach: Number(i?.reach) || 0,
    clicks: Number(i?.inline_link_clicks) || 0,
    frequency: Number(i?.frequency) || 0,
    leads: leadsFrom(i?.actions),
    resultType: leadResult(i?.actions).resultType,
    lpv: actionValue(i?.actions, "landing_page_view"),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    const body = await req.json();
    const { adAccountId, since, until, level } = body;
    // Several campaigns or ad sets can be ticked, as in Ads Manager (a single
    // campaignId / adsetId still works).
    const list = (many: unknown, one: unknown) => (Array.isArray(many) ? many : one ? [one] : []).map(String).slice(0, 50);
    const campaignIds = list(body.campaignIds, body.campaignId);
    const adsetIds = list(body.adsetIds, body.adsetId);
    if (!adAccountId || !since || !until) return json({ error: "adAccountId, since and until required" }, 400);
    if (!(await mayReadAccount(req, String(adAccountId)))) return json({ error: "Not allowed" }, 403);
    for (const id of [...campaignIds, ...adsetIds]) if (!/^\d+$/.test(id)) return json({ error: "bad id" }, 400);
    const actId = String(adAccountId).startsWith("act_") ? String(adAccountId) : `act_${adAccountId}`;
    const lvl: "campaign" | "adset" | "ad" = level === "ad" ? "ad" : level === "adset" ? "adset" : "campaign";
    const edge = lvl === "campaign" ? "campaigns" : lvl === "adset" ? "adsets" : "ads";
    // Always read from the account, narrowed to the ticked ad sets or campaigns.
    const parent = actId;
    const scope = lvl === "ad" && adsetIds.length ? [{ field: "adset.id", operator: "IN", value: adsetIds }]
      : lvl !== "campaign" && campaignIds.length ? [{ field: "campaign.id", operator: "IN", value: campaignIds }]
      : [];

    const tokens: string[] = [];
    for (const name of TOKEN_NAMES) {
      const { data } = await supabase.rpc("get_secret", { secret_name: name });
      if (data) tokens.push(data);
    }
    if (!tokens.length) return json({ rows: [], note: "No Facebook token configured" });

    const range = JSON.stringify({ since, until });
    const fields = [
      "id", "name", "status", "effective_status", "created_time",
      ...(lvl !== "ad" ? ["daily_budget", "lifetime_budget"] : []),
      ...(lvl === "campaign" ? ["stop_time"] : lvl === "adset" ? ["end_time"] : []),
      ...(lvl !== "campaign" ? ["campaign{id,name}"] : []),
      ...(lvl === "ad" ? ["adset{id,name}", "creative{body,title,image_url,thumbnail_url,call_to_action_type,link_url,object_story_spec}"] : []),
      `insights.time_range(${range}){${INSIGHT_FIELDS}}`,
    ].join(",");
    const filter = encodeURIComponent(JSON.stringify([...scope, { field: "effective_status", operator: "IN", value: ["ACTIVE", "PAUSED", "CAMPAIGN_PAUSED", "ADSET_PAUSED", "IN_PROCESS", "WITH_ISSUES", "PENDING_REVIEW", "DISAPPROVED"] }]));

    let lastErr = "";
    for (const token of tokens) {
      const res = await fetch(`${GRAPH}/${parent}/${edge}?fields=${fields}&filtering=${filter}&limit=200&access_token=${token}`);
      const data = await res.json();
      if (data.error) {
        if (RATE_LIMIT_CODES.has(Number(data.error.code))) return json({ rows: [], note: "busy" });
        lastErr = data.error.message || "error";
        continue;
      }
      // deno-lint-ignore no-explicit-any
      const rows = (data.data || []).map((e: any) => {
        const c = e.creative ?? {};
        const link = c.object_story_spec?.link_data ?? c.object_story_spec?.video_data ?? {};
        return {
          id: e.id,
          name: e.name,
          status: e.status,
          delivery: e.effective_status,
          created: e.created_time,
          // Budgets come in cents.
          dailyBudget: e.daily_budget ? Number(e.daily_budget) / 100 : null,
          lifetimeBudget: e.lifetime_budget ? Number(e.lifetime_budget) / 100 : null,
          ends: e.stop_time || e.end_time || null,
          campaign: e.campaign ? { id: e.campaign.id, name: e.campaign.name } : null,
          adset: e.adset ? { id: e.adset.id, name: e.adset.name } : null,
          creative: lvl === "ad" ? {
            body: c.body || link.message || "",
            title: c.title || link.name || link.title || "",
            image: c.image_url || link.picture || link.image_url || c.thumbnail_url || "",
            cta: c.call_to_action_type || link.call_to_action?.type || "",
            link: c.link_url || link.link || link.call_to_action?.value?.link || "",
          } : null,
          ...numbers(e.insights?.data?.[0]),
        };
      })
        // On now, or spent in these dates.
        // deno-lint-ignore no-explicit-any
        .filter((r: any) => r.delivery === "ACTIVE" || r.spend > 0);

      try {
        const ek = await ekResults(actId, since, until, lvl, token);
        // deno-lint-ignore no-explicit-any
        for (const r of rows as any[]) { r.booked = ek[r.id]?.booked ?? 0; r.mandates = ek[r.id]?.mandates ?? 0; }
      } catch (e) {
        console.error("fb-adset-table: EstateKit results", e);
      }

      // The account's totals, for the tiles (reach can't be added up from rows).
      let account = null;
      if (lvl === "campaign") {
        const a = await (await fetch(`${GRAPH}/${actId}/insights?fields=${INSIGHT_FIELDS}&time_range=${encodeURIComponent(range)}&access_token=${token}`)).json();
        if (!a.error) account = numbers(a.data?.[0]);
      }
      return json({ rows, account });
    }
    console.warn("fb-adset-table: all tokens failed:", lastErr);
    return json({ rows: [], note: lastErr });
  } catch (err) {
    return json({ rows: [], note: String(err) });
  }
});

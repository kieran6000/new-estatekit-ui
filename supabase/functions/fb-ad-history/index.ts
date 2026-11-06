import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// The client page's "Change history": what changed on the ad account between
// two dates, from Facebook's activity log (the same list as Ads Manager's
// Account history): who, what, on which campaign/ad set/ad, old -> new.

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
};
const GRAPH = "https://graph.facebook.com/v21.0";
const TOKEN_NAMES = ["FB_ACCESS_TOKEN", "FB_ACCESS_TOKEN_2"];
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

function userIdFrom(jwt: string): string | null {
  try {
    const part = jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const p = JSON.parse(atob(part + "===".slice((part.length + 3) % 4)));
    return p.role === "authenticated" && typeof p.sub === "string" ? p.sub : null;
  } catch {
    return null;
  }
}

/** Only an operator, or the agent who owns this ad account. */
async function mayReadAccount(req: Request, adAccountId: string): Promise<boolean> {
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const uid = jwt ? userIdFrom(jwt) : null;
  if (!uid) return false;
  const { data: me } = await supabase.from("agent_profiles").select("is_operator, fb_ad_account_id").eq("agent_id", uid).maybeSingle();
  if (me?.is_operator === true) return true;
  const own = String(me?.fb_ad_account_id ?? "").replace(/^act_/, "").trim();
  return own !== "" && own === String(adAccountId).replace(/^act_/, "").trim();
}

/** Facebook wraps some values, like budgets and targeting, in objects and lists.
 *  Gives the plain value: a number, or wording like "Locations: Centurion". */
// deno-lint-ignore no-explicit-any
function readable(v: any): string {
  if (v == null) return "";
  if (typeof v !== "object") return String(v);
  if (Array.isArray(v)) return v.map(readable).filter(Boolean).join(", ");
  if ("content" in v) {
    const inner = readable(v.children);
    const label = String(v.content ?? "").replace(/:\s*$/, "");
    return inner ? `${label}: ${inner}` : label;
  }
  for (const key of ["old_value", "new_value", "amount", "value", "budget"]) {
    if (key in v) return readable(v[key]);
  }
  return Object.entries(v)
    .filter(([k]) => !/currency|type|offset|^id$|_id$/i.test(k))
    .map(([, inner]) => readable(inner))
    .filter(Boolean)
    .join(", ");
}
// Long enough to compare a full targeting list, not just its start.
const short = (s: string) => (s.length > 3000 ? s.slice(0, 2999) + "…" : s);

// One busy day can fill a page, so a page isn't enough to reach back through the dates.
const MAX_PAGES = 15;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    const { adAccountId, since, until } = await req.json();
    if (!adAccountId || !since || !until) return json({ error: "adAccountId, since and until required" }, 400);
    if (!(await mayReadAccount(req, String(adAccountId)))) return json({ error: "Not allowed" }, 403);
    const actId = String(adAccountId).startsWith("act_") ? String(adAccountId) : `act_${adAccountId}`;

    const tokens: string[] = [];
    for (const name of TOKEN_NAMES) {
      const { data } = await supabase.rpc("get_secret", { secret_name: name });
      if (data) tokens.push(data);
    }
    if (!tokens.length) return json({ items: [], note: "No Facebook token configured" });

    // since/until are days (YYYY-MM-DD, both included); the log takes times.
    const from = Math.floor(Date.parse(`${since}T00:00:00Z`) / 1000);
    const to = Math.floor(Date.parse(`${until}T23:59:59Z`) / 1000);
    const fields = "event_time,event_type,translated_event_type,object_id,object_name,object_type,actor_name,extra_data";

    let lastErr = "";
    for (const token of tokens) {
      const res = await fetch(`${GRAPH}/${actId}/activities?fields=${fields}&since=${from}&until=${to}&limit=200&access_token=${token}`);
      const data = await res.json();
      if (data.error) {
        if (RATE_LIMIT_CODES.has(Number(data.error.code))) return json({ items: [], note: "busy" });
        lastErr = data.error.message || "error";
        continue;
      }
      // deno-lint-ignore no-explicit-any
      const raw: any[] = [...(data.data || [])];
      let next: string | undefined = data.paging?.next;
      for (let page = 1; next && page < MAX_PAGES; page++) {
        const more = await (await fetch(next)).json();
        if (more.error) break; // Show what we have.
        raw.push(...(more.data || []));
        next = more.paging?.next;
      }
      // deno-lint-ignore no-explicit-any
      const items = raw.map((a: any) => {
        let change: { from: string; to: string } | null = null;
        try {
          const x = typeof a.extra_data === "string" ? JSON.parse(a.extra_data) : a.extra_data;
          if (x && ("old_value" in x || "new_value" in x)) change = { from: short(readable(x.old_value)), to: short(readable(x.new_value)) };
        } catch { /* not JSON */ }
        return {
          at: a.event_time,
          what: a.translated_event_type || a.event_type,
          type: a.event_type,
          objectType: a.object_type,
          objectName: a.object_name,
          who: a.actor_name || "",
          change,
        };
      });
      return json({ items });
    }
    console.warn("fb-ad-history: all tokens failed:", lastErr);
    return json({ items: [], note: lastErr });
  } catch (err) {
    return json({ items: [], note: String(err) });
  }
});

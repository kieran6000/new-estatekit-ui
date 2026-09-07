import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Returns the currently-delivering ads for an ad account, with the creative
// fields needed to render an ad-preview card (image, copy, headline, CTA, page).

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

interface Creative {
  body?: string;
  title?: string;
  image_url?: string;
  thumbnail_url?: string;
  call_to_action_type?: string;
  link_url?: string;
  object_story_spec?: { page_id?: string; link_data?: { link?: string; message?: string; name?: string } };
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

    const fields =
      "name,effective_status," +
      "creative{body,title,image_url,thumbnail_url,call_to_action_type,link_url,object_story_spec}," +
      "adset{name}";

    let lastErr = "";
    for (const token of tokens) {
      const url =
        `${GRAPH}/${actId}/ads?fields=${encodeURIComponent(fields)}` +
        `&effective_status=${encodeURIComponent('["ACTIVE"]')}&limit=25&access_token=${token}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok || data.error) {
        lastErr = data.error?.message || `HTTP ${res.status}`;
        continue;
      }

      const rows = (data.data ?? []) as Array<{
        id: string; name?: string; effective_status?: string;
        creative?: Creative; adset?: { name?: string };
      }>;

      // Resolve page names once per unique page so the card can show the
      // advertiser exactly like Facebook does.
      const pageIds = [...new Set(rows.map((r) => r.creative?.object_story_spec?.page_id).filter(Boolean))] as string[];
      const pageNames: Record<string, string> = {};
      for (const pid of pageIds) {
        try {
          const pr = await fetch(`${GRAPH}/${pid}?fields=name,picture&access_token=${token}`);
          const pd = await pr.json();
          if (pd?.name) pageNames[pid] = pd.name;
        } catch { /* non-fatal */ }
      }

      const ads = rows.map((r) => {
        const c = r.creative ?? {};
        const pid = c.object_story_spec?.page_id ?? "";
        return {
          id: r.id,
          name: r.name ?? "",
          status: r.effective_status ?? "",
          adSetName: r.adset?.name ?? "",
          pageName: pid ? pageNames[pid] ?? "" : "",
          body: c.body ?? c.object_story_spec?.link_data?.message ?? "",
          headline: c.title ?? c.object_story_spec?.link_data?.name ?? "",
          imageUrl: c.image_url ?? c.thumbnail_url ?? "",
          cta: c.call_to_action_type ?? "",
          link: c.link_url ?? c.object_story_spec?.link_data?.link ?? "",
        };
      });

      return json({ ads });
    }

    // Same graceful degradation as fb-ad-account: no access shouldn't error the page.
    console.warn("fb-active-ads: all tokens failed:", lastErr);
    return json({ ads: [], note: lastErr });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

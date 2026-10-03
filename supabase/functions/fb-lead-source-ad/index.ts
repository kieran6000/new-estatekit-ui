import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Given one of our leads, work out which Facebook ad it came from and return
// that ad's creative, so the lead page can show the ad the person clicked.
//
// Facebook lead objects carry ad_id, so an existing lead can be resolved from
// its fb_lead_id retroactively. Landing-page leads from an ad carry the ad id
// in the link instead: ad_id, or utm_content (our ads' URL parameters put
// {{ad.id}} there). The result is cached back onto the lead.

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
const TOKEN_NAMES = ["FB_ACCESS_TOKEN", "FB_ACCESS_TOKEN_2", "FB_ACCESS_TOKEN_ALDREDT"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    const { leadId } = await req.json();
    if (!leadId) return json({ error: "leadId required" }, 400);

    const { data: lead } = await supabase
      .from("leads")
      .select("id, fb_lead_id, fb_ad_id, attribution")
      .eq("id", leadId)
      .maybeSingle();
    if (!lead) return json({ error: "Lead not found" }, 404);

    // A landing-page lead's ad id, from the link it arrived on.
    const a = (lead.attribution ?? {}) as Record<string, string>;
    const fromLink = [a.ad_id, /^(fb|facebook|ig|instagram)$/i.test(a.utm_source ?? "") ? a.utm_content : ""]
      .find((v) => typeof v === "string" && /^\d{6,25}$/.test(v)) ?? null;

    // Website leads that didn't come from an ad have nothing to show.
    if (!lead.fb_lead_id && !lead.fb_ad_id && !fromLink) return json({ ad: null, reason: "not_from_fb" });

    const tokens: string[] = [];
    for (const name of TOKEN_NAMES) {
      const { data } = await supabase.rpc("get_secret", { secret_name: name });
      if (data) tokens.push(data);
    }
    if (tokens.length === 0) return json({ ad: null, reason: "no_token" });

    let adId: string | null = lead.fb_ad_id ?? fromLink;

    // Resolve ad_id from the Facebook lead object if we haven't already.
    if (!adId && lead.fb_lead_id) {
      for (const token of tokens) {
        const r = await fetch(`${GRAPH}/${lead.fb_lead_id}?fields=ad_id,ad_name,campaign_name&access_token=${token}`);
        const d = await r.json();
        if (r.ok && !d.error && d.ad_id) { adId = String(d.ad_id); break; }
      }
      if (adId) {
        await supabase.from("leads").update({ fb_ad_id: adId }).eq("id", lead.id);
      }
    }

    if (!adId) return json({ ad: null, reason: "ad_unresolved" });

    const fields =
      "name,effective_status," +
      "creative{body,title,image_url,thumbnail_url,call_to_action_type,link_url," +
      "effective_object_story_id,object_story_spec}";

    for (const token of tokens) {
      const r = await fetch(`${GRAPH}/${adId}?fields=${encodeURIComponent(fields)}&access_token=${token}`);
      const d = await r.json();
      if (!r.ok || d.error) continue;
      // Remember a link-found ad id once it's proven to be a real ad.
      if (!lead.fb_ad_id) await supabase.from("leads").update({ fb_ad_id: adId }).eq("id", lead.id);

      const c = d.creative ?? {};
      const storyId: string = c.effective_object_story_id ?? "";
      const [sPage, sPost] = storyId.split("_");
      return json({
        ad: {
          id: adId,
          name: d.name ?? "",
          status: d.effective_status ?? "",
          body: c.body ?? c.object_story_spec?.link_data?.message ?? "",
          headline: c.title ?? c.object_story_spec?.link_data?.name ?? "",
          imageUrl: c.image_url ?? c.thumbnail_url ?? "",
          cta: c.call_to_action_type ?? "",
          link: c.link_url ?? c.object_story_spec?.link_data?.link ?? "",
          postUrl: sPage && sPost ? `https://www.facebook.com/${sPage}/posts/${sPost}` : "",
        },
      });
    }

    return json({ ad: null, reason: "creative_unreadable", adId });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

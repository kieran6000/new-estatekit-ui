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
  effective_object_story_id?: string;
  object_story_spec?: { page_id?: string; link_data?: { link?: string; message?: string; name?: string } };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    const { adAccountId, statuses } = await req.json();
    if (!adAccountId) return json({ error: "adAccountId required" }, 400);
    const actId = String(adAccountId).startsWith("act_") ? String(adAccountId) : `act_${adAccountId}`;
    // Defaults to just-delivering ads; callers can pass ["PAUSED"] to list
    // paused ads instead (used for the "resume" list in the dashboard).
    const wantedStatuses: string[] = Array.isArray(statuses) && statuses.length ? statuses : ["ACTIVE"];

    const tokens: string[] = [];
    for (const name of TOKEN_NAMES) {
      const { data } = await supabase.rpc("get_secret", { secret_name: name });
      if (data) tokens.push(data);
    }
    if (tokens.length === 0) return json({ error: "No FB token configured" }, 500);

    const fields =
      "name,effective_status," +
      "creative{body,title,image_url,thumbnail_url,call_to_action_type,link_url," +
      "effective_object_story_id,object_story_spec}," +
      "adset{name}";

    let lastErr = "";
    for (const token of tokens) {
      const url =
        `${GRAPH}/${actId}/ads?fields=${encodeURIComponent(fields)}` +
        `&effective_status=${encodeURIComponent(JSON.stringify(wantedStatuses))}&limit=25&access_token=${token}`;
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

      // The page id is on object_story_spec for inline creatives, but page-post
      // shares only carry it as the prefix of effective_object_story_id.
      const pageIdOf = (c: Creative) =>
        c.object_story_spec?.page_id || (c.effective_object_story_id ?? "").split("_")[0] || "";

      const pageIds = [...new Set(rows.map((r) => pageIdOf(r.creative ?? {})).filter(Boolean))];
      const pages: Record<string, { name: string; avatar: string }> = {};
      for (const pid of pageIds) {
        try {
          const pr = await fetch(`${GRAPH}/${pid}?fields=name,picture.type(large)&access_token=${token}`);
          const pd = await pr.json();
          if (pd?.name || pd?.picture) {
            pages[pid] = { name: pd?.name ?? "", avatar: pd?.picture?.data?.url ?? "" };
          }
        } catch { /* non-fatal */ }
      }

      const ads = rows.map((r) => {
        const c = r.creative ?? {};
        const pid = pageIdOf(c);
        const storyId = c.effective_object_story_id ?? "";
        // pageId_postId -> the public permalink for that post.
        const [sPage, sPost] = storyId.split("_");
        return {
          id: r.id,
          name: r.name ?? "",
          status: r.effective_status ?? "",
          adSetName: r.adset?.name ?? "",
          pageName: pages[pid]?.name ?? "",
          pageAvatar: pages[pid]?.avatar ?? "",
          postUrl: sPage && sPost ? `https://www.facebook.com/${sPage}/posts/${sPost}` : "",
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

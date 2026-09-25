import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
};

async function notifyActivity(payload: unknown): Promise<void> {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/track-activity`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch { /* best-effort */ }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "content-type,authorization,apikey,x-client-info",
        "Access-Control-Allow-Methods": "POST,OPTIONS",
      },
    });
  }
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  let body: {
    pageId?: string;
    name?: string;
    phone?: string;
    email?: string | null;
    formAnswers?: { q: string; a: string }[];
    attribution?: Record<string, unknown>;
    quality?: string;
  };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), { status: 400, headers: CORS });
  }

  if (!body.pageId || !body.name || !body.phone) {
    return new Response(JSON.stringify({ error: "pageId, name and phone are required" }), { status: 400, headers: CORS });
  }

  const supabase = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: page, error: pageErr } = await supabase
    .from("lead_pages")
    .select("id, agent_id, pipeline_id, agent_name")
    .eq("id", body.pageId)
    .maybeSingle();

  if (pageErr || !page) {
    return new Response(JSON.stringify({ error: "Page not found" }), { status: 404, headers: CORS });
  }

  // Attribution is visitor-supplied (it comes from the query string), so keep
  // only keys we expect and cap the values — this lands in a jsonb column that
  // agents read, and an unbounded query string shouldn't end up in the row.
  const ALLOWED_ATTRIBUTION = [
    "ad_id", "adset_id", "campaign_id", "ad_name", "campaign_name",
    "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
    "fbclid", "gclid", "referrer",
  ];
  const attribution: Record<string, string> = {};
  for (const key of ALLOWED_ATTRIBUTION) {
    const value = body.attribution?.[key];
    if (typeof value === "string" && value.trim()) attribution[key] = value.slice(0, 200);
  }

  const { data: lead, error } = await supabase
    .from("leads")
    .insert({
      agent_id: page.agent_id,
      pipeline_id: page.pipeline_id,
      source_page_id: page.id,
      name: body.name,
      phone: body.phone,
      email: body.email ?? null,
      form_answers: body.formAnswers ?? [],
      attribution,
      // Only ever "good" or "weak" — anything else is treated as good rather
      // than trusted, since this arrives from the public page.
      quality: body.quality === "weak" ? "weak" : "good",
      // Meta's {{ad.id}} macro on the landing-page URL is the only way a
      // website lead can name the ad that produced it.
      fb_ad_id: attribution.ad_id ?? null,
      stage: "New Lead",
      next_label: "Just came in",
      due: true,
    })
    .select("id")
    .single();

  if (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: CORS });
  }

  // 32 hex chars (122 random bits). Was 8 (32 bits): once tokens stop being
  // publicly listable, 8 chars is short enough to guess by brute force.
  const token = crypto.randomUUID().replace(/-/g, "");
  await supabase.from("lead_share_tokens").insert({
    lead_id: lead.id,
    agent_id: page.agent_id,
    token,
    link_type: "first_touch",
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  });

  // Look up the pipeline name for a richer activity card.
  let pipelineName: string | undefined;
  if (page.pipeline_id) {
    const { data: pl } = await supabase.from("pipelines").select("name").eq("id", page.pipeline_id).maybeSingle();
    pipelineName = pl?.name;
  }
  const answers = body.formAnswers ?? [];
  const address = answers.find((a) => /address/i.test(a.q))?.a;

  // Name the traffic source on the alert so the agent knows whether this came
  // off an ad or straight to the page.
  const sourceLabel = attribution.ad_id || attribution.fbclid
    ? "Website form · Facebook ad"
    : attribution.utm_source
      ? `Website form · ${attribution.utm_source}`
      : "Website form";

  await notifyActivity({
    event: "new_lead",
    agentId: page.agent_id,
    lead: { id: lead.id, name: body.name, phone: body.phone, address, pipeline: pipelineName, source: sourceLabel },
  });

  return new Response(JSON.stringify({ id: lead.id }), { headers: CORS });
});

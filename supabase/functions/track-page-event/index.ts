import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Records a visitor's progress through a published landing page and posts
// each step to the Discord activity channel. Called from the public page,
// signed out, so it validates everything and only ever writes one row per
// visitor session per step.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const supabase = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

const EVENTS = ["view", "start", "contact", "disqualified", "submit"];

// Which track-activity embed each step becomes. Submits aren't posted here —
// public-submit-lead already announces the new lead.
const DISCORD_EVENT: Record<string, string> = {
  view: "page_view",
  start: "form_started",
  contact: "form_contact_step",
  disqualified: "lead_disqualified",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    const { pageId, sessionId, event, source, detail } = await req.json().catch(() => ({}));
    if (
      typeof pageId !== "string" ||
      typeof sessionId !== "string" || sessionId.length < 8 || sessionId.length > 64 ||
      !EVENTS.includes(event)
    ) {
      return json({ ok: false }, 400);
    }

    const { data: page } = await supabase
      .from("lead_pages")
      .select("id, agent_id, name, slug, pipeline_id")
      .eq("id", pageId)
      .maybeSingle();
    if (!page) return json({ ok: false }, 404);

    const cleanSource = typeof source === "string" && source ? source.slice(0, 80) : null;

    const { data: inserted, error } = await supabase
      .from("lead_page_events")
      .upsert(
        { page_id: page.id, agent_id: page.agent_id, session_id: sessionId, event_type: event, source: cleanSource },
        { onConflict: "page_id,session_id,event_type", ignoreDuplicates: true },
      )
      .select("id");
    if (error) {
      console.error("track-page-event insert failed:", error.message);
      return json({ ok: false }, 500);
    }

    // Only announce a step the first time this visitor reaches it.
    const discordEvent = DISCORD_EVENT[event];
    if ((inserted?.length ?? 0) > 0 && discordEvent) {
      let pipeline: string | undefined;
      if (page.pipeline_id) {
        const { data: pl } = await supabase.from("pipelines").select("name").eq("id", page.pipeline_id).maybeSingle();
        pipeline = pl?.name;
      }
      try {
        await fetch(`${SUPABASE_URL}/functions/v1/track-activity`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: discordEvent,
            agentId: page.agent_id,
            page: { name: page.name, slug: page.slug },
            lead: {
              name: event === "disqualified" ? "Visitor" : undefined,
              reason: event === "disqualified" && typeof detail === "string" ? detail.slice(0, 200) : undefined,
              pipeline,
              source: cleanSource ?? undefined,
            },
          }),
        });
      } catch { /* best-effort */ }
    }

    return json({ ok: true });
  } catch (err) {
    console.error("track-page-event failed:", err);
    return json({ ok: false }, 500);
  }
});

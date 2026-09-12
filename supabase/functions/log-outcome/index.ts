import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Lets an agent log a call outcome straight from a WhatsApp action link, without
// signing in. Authorisation is the share token itself: it is single-lead scoped
// and expires, so it can only ever move its own lead.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

const DEAD_STAGES = ["Lost", "Invalid Number"];

// Must stay in step with PIPELINE_STAGES in src/types.
const STAGES_FOR_KIND: Record<string, string[]> = {
  seller: ["New Lead", "No Answer", "Contacted", "Booked", "Mandate Signed", "Lost", "Invalid Number"],
  buyer: ["New Lead", "No Answer", "Contacted", "Viewing Booked", "Offer Made", "Bought", "Lost", "Invalid Number"],
};

function reminderISO(days: number): string {
  return new Date(Date.now() + days * 86400000).toISOString();
}

/** Mirrors computeStagePatch in src/lib/stageLogic.ts — the SOP for each stage.
 *  Logged-out logging skips the follow-up questions, so sensible defaults are
 *  applied (the agent can refine later in the dashboard). */
function stagePatch(stage: string): Record<string, unknown> {
  if (stage === "Contacted" || stage === "Offer Made") {
    return { due: false, next_label: "Follow up in 2 days", reminder_at: reminderISO(2) };
  }
  if (stage === "No Answer") {
    return { due: true, next_label: "Retry today", reminder_at: new Date().toISOString() };
  }
  if (stage === "Booked" || stage === "Viewing Booked") {
    return { due: false, next_label: "Appt set", reminder_at: null };
  }
  if (stage === "Mandate Signed" || stage === "Bought") {
    return { due: false, next_label: "—", reminder_at: null };
  }
  if (DEAD_STAGES.includes(stage)) {
    return { due: false, next_label: "—", reminder_at: null };
  }
  return {};
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const { token, stage } = await req.json();
    if (!token || !stage) return json({ error: "token and stage required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: tokenRow } = await admin
      .from("lead_share_tokens")
      .select("lead_id, agent_id, expires_at")
      .eq("token", token)
      .maybeSingle();

    if (!tokenRow) return json({ error: "Invalid link" }, 404);
    if (new Date(tokenRow.expires_at) < new Date()) return json({ error: "Link expired" }, 410);

    const { data: lead } = await admin
      .from("leads")
      .select("id, name, phone, stage, agent_id, pipeline_id")
      .eq("id", tokenRow.lead_id)
      .maybeSingle();
    if (!lead) return json({ error: "Lead not found" }, 404);
    // The token must belong to the same agent as the lead.
    if (lead.agent_id !== tokenRow.agent_id) return json({ error: "Not allowed" }, 403);

    // The stage has to be one this lead's own pipeline actually offers, so a
    // buyer lead can never be moved to a seller-only stage (or vice versa).
    const { data: pipeline } = await admin
      .from("pipelines")
      .select("kind")
      .eq("id", lead.pipeline_id)
      .maybeSingle();
    const kind = pipeline?.kind === "buyer" ? "buyer" : "seller";
    if (!STAGES_FOR_KIND[kind].includes(stage)) {
      return json({ error: `"${stage}" isn't a stage in this ${kind} pipeline` }, 400);
    }

    // Tag the write so the lead history shows the agent, via their WhatsApp link.
    const writer = createClient(SUPABASE_URL, SERVICE_KEY, {
      global: { headers: { "x-ek-source": "action_link", "x-ek-actor": tokenRow.agent_id } },
    });
    const { error } = await writer
      .from("leads")
      .update({ stage, ...stagePatch(stage) })
      .eq("id", lead.id);
    if (error) return json({ error: error.message }, 500);

    // Best-effort activity log so it still shows up in Discord/PostHog.
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/track-activity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "stage_change",
          agentId: lead.agent_id,
          lead: { id: lead.id, name: lead.name, phone: lead.phone, fromStage: lead.stage, toStage: stage, pipeline: kind },
          note: "logged from action link (not signed in)",
        }),
      });
    } catch { /* non-fatal */ }

    return json({ ok: true, stage, pipelineKind: kind });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

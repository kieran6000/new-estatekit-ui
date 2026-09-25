import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// REDACTED when pulled into git (25 Sept). The deployed function has this
// webhook hardcoded. Set the DISCORD_LEAD_ACTIVITY_WEBHOOK secret before
// redeploying from the repo, or lead-activity posts to Discord will stop.
const DISCORD_LEAD_ACTIVITY = Deno.env.get("DISCORD_LEAD_ACTIVITY_WEBHOOK") ?? "";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }

  const secret = Deno.env.get("LEAD_WEBHOOK_SECRET");
  if (!secret || req.headers.get("X-Webhook-Secret") !== secret) {
    return new Response("unauthorized", { status: 401 });
  }

  let body: {
    agent_id?: string;
    name?: string;
    phone?: string;
    email?: string;
    pipeline_id?: string;
    source_page_id?: string;
    form_answers?: { q: string; a: string }[];
  };
  try {
    body = await req.json();
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  if (!body.agent_id || !body.name || !body.phone) {
    return new Response("agent_id, name and phone are required", { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: lead, error } = await supabase
    .from("leads")
    .insert({
      agent_id: body.agent_id,
      name: body.name,
      phone: body.phone,
      email: body.email ?? null,
      pipeline_id: body.pipeline_id ?? null,
      source_page_id: body.source_page_id ?? null,
      form_answers: body.form_answers ?? [],
      stage: "New Lead",
      next_label: "Just came in",
      due: true,
    })
    .select("id")
    .single();

  if (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  // Get agent name for Discord log
  const { data: profile } = await supabase
    .from("agent_profiles")
    .select("display_name")
    .eq("agent_id", body.agent_id)
    .maybeSingle();
  const agentName = profile?.display_name || "Unknown agent";
  const answerLines = (body.form_answers ?? []).filter(a => a.a).map(a => `**${a.q}**: ${a.a}`).join("\n");
  const msg = `\u{1F4E5} **Webhook lead** for ${agentName}\n**Name**: ${body.name}\n**Phone**: ${body.phone}\n${answerLines}`;
  try {
    await fetch(DISCORD_LEAD_ACTIVITY, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: msg.slice(0, 2000) }),
    });
  } catch { /* best-effort */ }

  return new Response(JSON.stringify({ id: lead.id }), {
    headers: { "Content-Type": "application/json" },
  });
});

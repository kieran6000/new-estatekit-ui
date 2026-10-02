import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Deactivate or reactivate a client's account (operators only).
//
//   { action: "deactivate", agentId, reason }
//     - Blocks sign-in: the auth user is banned, so no new session or token
//       refresh works. Anyone still signed in hits the "account paused"
//       screen on their next page load (agent_profiles.deactivated_at).
//     - Stops their automations (automations_paused) and cancels anything
//       queued, so nothing fires late after a reactivation.
//     - Their data stays: leads, pages and history are untouched, and lead
//       pages keep saving new leads so nothing paid for is lost.
//   { action: "reactivate", agentId }
//     - Lifts the ban and puts automations back the way they were.
//
// Both are written to the audit log. A database trigger
// (guard_account_status) stops anyone but staff changing these columns.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const REASONS = ["Not paid", "Cancelled", "On hold", "Other"];
const BANNED_FOR = "876000h"; // 100 years: until reactivated

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: who } = await admin.auth.getUser(jwt);
  const callerId = who?.user?.id;
  if (!callerId) return json({ error: "Not signed in" }, 401);
  const { data: caller } = await admin.from("agent_profiles").select("is_operator, display_name").eq("agent_id", callerId).maybeSingle();
  if (!caller?.is_operator) return json({ error: "Only EstateKit staff can do this." }, 403);

  let body: { action?: string; agentId?: string; reason?: string };
  try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  const agentId = String(body.agentId ?? "");
  if (!/^[0-9a-f-]{36}$/.test(agentId)) return json({ error: "Bad request" }, 400);
  if (agentId === callerId) return json({ error: "You can't deactivate your own account." }, 400);

  const { data: target } = await admin
    .from("agent_profiles")
    .select("display_name, is_operator, automations_paused, deactivated_at, automations_paused_before_deactivation")
    .eq("agent_id", agentId)
    .maybeSingle();
  if (!target) return json({ error: "Account not found" }, 404);
  if (target.is_operator) return json({ error: "Staff accounts can't be deactivated here." }, 400);

  const audit = (event: string, detail: string) =>
    admin.from("audit_log").insert({
      event, category: "account", actor_id: callerId, actor_name: caller.display_name ?? "", account_id: agentId, detail,
      data: { reason: body.reason ?? null }, device: req.headers.get("user-agent") ?? "",
    }).then(({ error }) => { if (error) console.error("audit insert failed", error.message); });

  if (body.action === "deactivate") {
    if (target.deactivated_at) return json({ ok: true, already: true });
    const reason = REASONS.includes(String(body.reason)) ? String(body.reason) : "Other";

    // Ban first: if this fails, nothing else has changed.
    const { error: banErr } = await admin.auth.admin.updateUserById(agentId, { ban_duration: BANNED_FOR });
    if (banErr) { console.error("ban failed", banErr.message); return json({ error: "Couldn't block their sign-in. Nothing was changed." }, 500); }

    const { error: upErr } = await admin.from("agent_profiles").update({
      deactivated_at: new Date().toISOString(),
      deactivated_reason: reason,
      deactivated_by_name: caller.display_name ?? "",
      automations_paused_before_deactivation: !!target.automations_paused,
      automations_paused: true,
    }).eq("agent_id", agentId);
    if (upErr) {
      await admin.auth.admin.updateUserById(agentId, { ban_duration: "none" });
      console.error("profile update failed", upErr.message);
      return json({ error: "Couldn't save the change. Nothing was changed." }, 500);
    }

    // Cancel queued automation messages for their leads.
    let cancelled = 0;
    for (let from = 0; ; from += 1000) {
      const { data: leads } = await admin.from("leads").select("id").eq("agent_id", agentId).range(from, from + 999);
      const ids = (leads ?? []).map((l) => l.id);
      for (let i = 0; i < ids.length; i += 200) {
        const { data } = await admin.from("automation_runs").update({ status: "cancelled" })
          .in("lead_id", ids.slice(i, i + 200)).in("status", ["pending", "processing"]).select("id");
        cancelled += data?.length ?? 0;
      }
      if (ids.length < 1000) break;
    }
    await audit("account_deactivated", `${target.display_name} deactivated: ${reason}`);
    return json({ ok: true, cancelled });
  }

  if (body.action === "reactivate") {
    const { error: unbanErr } = await admin.auth.admin.updateUserById(agentId, { ban_duration: "none" });
    if (unbanErr) { console.error("unban failed", unbanErr.message); return json({ error: "Couldn't unblock their sign-in." }, 500); }
    const { error: upErr } = await admin.from("agent_profiles").update({
      deactivated_at: null,
      deactivated_reason: null,
      deactivated_by_name: null,
      automations_paused: target.automations_paused_before_deactivation ?? false,
      automations_paused_before_deactivation: null,
    }).eq("agent_id", agentId);
    if (upErr) { console.error("profile update failed", upErr.message); return json({ error: "Couldn't save the change." }, 500); }
    await audit("account_reactivated", `${target.display_name} reactivated`);
    return json({ ok: true });
  }

  return json({ error: "Unknown action" }, 400);
});

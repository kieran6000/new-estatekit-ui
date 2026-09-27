// Delivery reports for the lead confirmation email, from Resend's webhook.
//
// Resend signs every call (Svix format). We verify the signature with
// RESEND_WEBHOOK_SECRET ("whsec_…") and reject anything else, so nobody can
// fake a report. Each report is matched to its lead by
// leads.confirmation_email_id and written to the lead's history.
//
// Handled: delivered, delivery_delayed, bounced, complained, opened (first
// open only). "sent" is already logged by send-lead-confirmation; "clicked"
// is counted by our own /w/<lead> redirect (Resend click tracking stays off
// so the WhatsApp link isn't rewritten). Everything else is acknowledged and
// ignored.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const EVENT: Record<string, string> = {
  "email.delivered": "email_delivered",
  "email.delivery_delayed": "email_delayed",
  "email.bounced": "email_bounced",
  "email.complained": "email_complained",
  "email.opened": "email_opened",
};

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Svix signature check: HMAC-SHA256 over "<id>.<timestamp>.<body>". */
async function verify(req: Request, body: string, secret: string): Promise<boolean> {
  const id = req.headers.get("svix-id");
  const ts = req.headers.get("svix-timestamp");
  const sigs = req.headers.get("svix-signature");
  if (!id || !ts || !sigs) return false;
  // Reject stale or future-dated calls (replays).
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 5 * 60) return false;
  const key = await crypto.subtle.importKey("raw", b64ToBytes(secret.replace(/^whsec_/, "")), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${body}`)));
  const expected = btoa(String.fromCharCode(...mac));
  return sigs.split(" ").some((part) => {
    const [, sig] = part.split(",");
    if (!sig || sig.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
    return diff === 0;
  });
}

const ok = (body: unknown = { ok: true }) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  const secret = Deno.env.get("RESEND_WEBHOOK_SECRET");
  if (!secret) return new Response("not configured", { status: 503 });

  const body = await req.text();
  if (!(await verify(req, body, secret))) return new Response("bad signature", { status: 401 });

  let evt: { type?: string; data?: { email_id?: string; bounce?: { message?: string; type?: string } } };
  try {
    evt = JSON.parse(body);
  } catch {
    return new Response("bad json", { status: 400 });
  }
  const type = EVENT[evt.type || ""];
  const emailId = evt.data?.email_id;
  if (!type || !emailId) return ok({ ok: true, ignored: evt.type });

  const { data: lead } = await supabase.from("leads").select("id, agent_id, email").eq("confirmation_email_id", emailId).maybeSingle();
  // Not one of ours (e.g. a test send from the Resend dashboard): acknowledge.
  if (!lead) return ok({ ok: true, ignored: "no matching lead" });

  // Opens can fire many times; only the first one goes in the history.
  if (type === "email_opened") {
    const { count } = await supabase.from("lead_events").select("id", { count: "exact", head: true }).eq("lead_id", lead.id).eq("event_type", "email_opened");
    if ((count ?? 0) > 0) return ok({ ok: true, ignored: "already opened" });
  }

  const detail =
    type === "email_bounced"
      ? `Couldn't be delivered to ${lead.email}${evt.data?.bounce?.message ? ` (${String(evt.data.bounce.message).slice(0, 120)})` : ""}`
      : type === "email_complained"
        ? `${lead.email} marked it as spam`
        : `To ${lead.email}`;

  const { error } = await supabase.from("lead_events").insert({
    lead_id: lead.id,
    agent_id: lead.agent_id,
    event_type: type,
    to_value: detail,
    source: "automation",
  });
  if (error) {
    console.error("history insert failed", error);
    return new Response("db error", { status: 500 }); // Resend will retry
  }
  return ok();
});

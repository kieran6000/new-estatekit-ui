// The wording of one automated email, for the Mail tab.
//
// Emails sent from 17 Nov 2026 keep their own copy on the record, so this
// hands that back straight away. Older ones were never kept, so we ask Resend
// for the email it actually posted and keep that copy from then on — the real
// email, not a rebuild of it.
//
// Two things are undone before anybody in the office reads it: the counting
// picture is taken out, and every link is put back to where it really goes.
// Otherwise a member of staff opening an old email would show up as the lead
// having opened it and tapped a link.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const APP = "https://leads.estatekit.co";
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

/** Out with the 1x1 counting picture, and the tracked links back to the real
 *  address they stand for. Anything we can't place is left exactly as it was. */
async function plain(emailId: string, html: string): Promise<string> {
  let out = html.replace(/<img[^>]*\/oe\/[^>]*>/gi, "");
  if (!out.includes(`${APP}/mc/`)) return out;
  const { data } = await admin.from("mail_links").select("id, url").eq("workflow_email_id", emailId);
  for (const l of (data ?? []) as { id: string; url: string }[]) {
    out = out.split(`${APP}/mc/${l.id}`).join(l.url);
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    // Caller must be an operator: these are other people's emails.
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: who } = await admin.auth.getUser(jwt);
    const callerId = who?.user?.id;
    if (!callerId) return json({ error: "Please sign in again." }, 401);
    const { data: caller } = await admin.from("agent_profiles").select("is_operator").eq("agent_id", callerId).maybeSingle();
    if (!caller?.is_operator) return json({ error: "Only EstateKit staff can read these." }, 403);

    const { id } = (await req.json().catch(() => ({}))) as { id?: string };
    if (!id) return json({ error: "Which email?" }, 400);

    const { data: rec } = await admin
      .from("workflow_emails")
      .select("id, body_html, resend_id")
      .eq("id", id)
      .maybeSingle();
    if (!rec) return json({ html: null });
    if (rec.body_html) return json({ html: rec.body_html });
    if (!rec.resend_id) return json({ html: null });

    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) return json({ html: null });
    const res = await fetch(`https://api.resend.com/emails/${rec.resend_id}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      // Resend only keeps emails for a while: an old one simply isn't there.
      console.error("resend fetch", res.status, await res.text().catch(() => ""));
      return json({ html: null });
    }
    const body = (await res.json()) as { html?: string | null };
    if (!body.html) return json({ html: null });

    const html = await plain(id, body.html);
    // Kept, so the next person to open it doesn't wait on Resend again.
    const { error } = await admin.from("workflow_emails").update({ body_html: html }).eq("id", id);
    if (error) console.error("keeping the fetched wording failed", error.message);
    return json({ html });
  } catch (e) {
    console.error("workflow-email-body", e);
    return json({ error: "We couldn't open that email just now." }, 500);
  }
});

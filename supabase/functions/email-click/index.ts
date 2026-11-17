// The confirmation email's "message me on WhatsApp" link:
//   leads.estatekit.co/w/<lead id>  (Vercel rewrite)  →  here  →  wa.me/…
//
// Records the click in the lead's history (email_clicked), then sends the
// person straight on to WhatsApp with the same pre-filled message as before.
// The destination is always built here from the lead and agent on record,
// never taken from the URL, so this can't be used to redirect anywhere else.
// Lead ids are random UUIDs, so they can't be guessed.
//
// It also handles the links in the mail we track ourselves - both the mail
// staff send from the team inbox and the automated workflow emails:
//   leads.estatekit.co/mc/<mail_links id>  (?m=)  →  here  →  the stored link
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { waDigits } from "../_shared/phone.ts";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const FALLBACK = "https://leads.estatekit.co/";

const first = (s: string | null | undefined) => (s || "").trim().split(/\s+/)[0] || "";
// South African numbers however they were typed: 083…, +27 083… (the 0 kept
// after the country code), or 83… (the 0 left off).
const digits = (s: string | null | undefined) => waDigits(s) || (s || "").replace(/\D/g, "");
// WhatsApp needs a cellphone. South African numbers must be mobiles (06/07/08,
// not an 010/011 office line); other countries (e.g. Namibia +264) are accepted.
const isMobile = (d: string) => (d.startsWith("27") ? /^27[6-8]\d{8}$/.test(d) : /^[1-9]\d{8,14}$/.test(d));
const redirect = (to: string) => new Response(null, { status: 302, headers: { Location: to, "Cache-Control": "no-store" } });

/** A link in a mail we track ourselves - one staff sent from the team inbox,
 *  or one of the automated workflow emails:
 *    leads.estatekit.co/mc/<mail_links id>  →  here (?m=)  →  the real link
 *  The destination is read from the row we wrote when the mail was sent, never
 *  from the URL, so an edited link can't send anyone anywhere else. */
async function trackedLinkClicked(linkId: string): Promise<string | null> {
  const { data: link, error } = await supabase
    .from("mail_links")
    .select("id, url, click_count, first_clicked_at, mail_sent_id, workflow_email_id")
    .eq("id", linkId)
    .maybeSingle();
  if (error || !link) return null;
  if (!/^https?:\/\//i.test(link.url)) return null;

  const now = new Date().toISOString();
  const { error: linkErr } = await supabase
    .from("mail_links")
    .update({ click_count: (link.click_count ?? 0) + 1, first_clicked_at: link.first_clicked_at ?? now, last_clicked_at: now })
    .eq("id", link.id);
  if (linkErr) console.error("mail link click log failed", linkErr);

  if (link.mail_sent_id) await sentMailClicked(link.mail_sent_id, link.url, now);
  else if (link.workflow_email_id) await workflowEmailClicked(link.workflow_email_id, link.url, now);
  return link.url;
}

/** Mail staff sent by hand from the Mail tab. */
async function sentMailClicked(mailId: string, url: string, now: string) {
  const { data: mail } = await supabase.from("mail_sent").select("id, clicked_at, click_count").eq("id", mailId).maybeSingle();
  if (!mail) return;
  const { error } = await supabase
    .from("mail_sent")
    .update({ clicked_at: mail.clicked_at ?? now, click_count: (mail.click_count ?? 0) + 1, last_click_url: url })
    .eq("id", mail.id);
  if (error) console.error("mail click log failed", error);
}

/** One of the automated emails. The tick sits on that one email, and the
 *  first tap also goes in the lead's history, so the agent sees the interest. */
async function workflowEmailClicked(emailId: string, url: string, now: string) {
  const { data: em } = await supabase
    .from("workflow_emails")
    .select("id, lead_id, agent_id, subject, clicked_at, click_count")
    .eq("id", emailId)
    .maybeSingle();
  if (!em) return;
  const { error } = await supabase
    .from("workflow_emails")
    .update({ clicked_at: em.clicked_at ?? now, click_count: (em.click_count ?? 0) + 1, last_click_url: url })
    .eq("id", em.id);
  if (error) console.error("workflow email click log failed", error);
  if (!em.clicked_at) {
    const { error: evErr } = await supabase.from("lead_events").insert({
      lead_id: em.lead_id,
      agent_id: em.agent_id,
      event_type: "email_clicked",
      to_value: `Tapped a link in "${String(em.subject ?? "an email").slice(0, 80)}"`,
      source: "automation",
    });
    if (evErr) console.error("workflow email click history failed", evErr);
  }
}

Deno.serve(async (req) => {
  const params = new URL(req.url).searchParams;

  // A link in mail we track ourselves: the team inbox or a workflow email.
  const linkId = params.get("m") || "";
  if (/^[0-9a-f-]{36}$/i.test(linkId)) {
    let to: string | null = null;
    try { to = await trackedLinkClicked(linkId); } catch (e) { console.error("mail link click failed", e); }
    return redirect(to ?? FALLBACK);
  }
  const id = params.get("l") || "";
  // Where the tap came from: the email (default) or the selling plan. Only a
  // known value changes the wording; nothing from the URL goes into the link.
  const fromPlan = params.get("from") === "plan";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return redirect(FALLBACK);

  const { data: lead } = await supabase.from("leads").select("id, name, agent_id, pipeline_id, source_page_id, form_answers").eq("id", id).maybeSingle();
  if (!lead) return redirect(FALLBACK);

  const [{ data: agent }, { data: page }, { data: pipeline }] = await Promise.all([
    supabase.from("agent_profiles").select("display_name, whatsapp_number").eq("agent_id", lead.agent_id).maybeSingle(),
    lead.source_page_id ? supabase.from("lead_pages").select("agent_name, phone").eq("id", lead.source_page_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("pipelines").select("kind").eq("id", lead.pipeline_id).maybeSingle(),
  ]);

  // Same number and message as the email (see send-lead-confirmation).
  const waNumber = [digits(agent?.whatsapp_number), digits(page?.phone)].find(isMobile) || "";
  if (!waNumber) return redirect(FALLBACK);
  const agentFirst = first(agent?.display_name || page?.agent_name) || "there";
  const answers = Array.isArray(lead.form_answers) ? (lead.form_answers as { q?: string; a?: string }[]) : [];
  let address = (answers.find((x) => /address/i.test(x.q || ""))?.a || "").trim().slice(0, 160);
  if (address === address.toLowerCase()) address = address.replace(/\b([a-z])/g, (m) => m.toUpperCase());
  const what =
    pipeline?.kind === "buyer"
      ? "I just sent you my details about finding a home."
      : pipeline?.kind === "general"
        ? "I just sent you my details."
        : `I just requested a home evaluation${address ? ` for ${address}` : ""}.`;
  const text = fromPlan
    ? `Hi ${agentFirst}, it's ${first(lead.name) || lead.name}. I read my marketing plan${address ? ` for ${address}` : ""}. I'd like to book a free consultation. When suits you?`
    : `Hi ${agentFirst}, it's ${first(lead.name) || lead.name}. ${what}`;

  // Record it, but never let that hold up the person on their way to WhatsApp.
  const { error } = await supabase.from("lead_events").insert({
    lead_id: lead.id,
    agent_id: lead.agent_id,
    event_type: "email_clicked",
    to_value: fromPlan ? "Tapped WhatsApp on their selling plan" : "Tapped \"message me on WhatsApp\" in the email",
    source: "automation",
  });
  if (error) console.error("click log failed", error);

  return redirect(`https://wa.me/${waNumber}?text=${encodeURIComponent(text)}`);
});

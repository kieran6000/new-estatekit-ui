// Confirmation email to a new lead, sent on the agent's behalf.
//
// Called by the database (trigger queue_lead_confirmation, via pg_net) with
// { id } — only for leads that have an email, of agents who have
// agent_profiles.lead_confirmation_email switched on.
//
// Safe to be public: it acts only on a lead under 15 minutes old that hasn't
// been emailed yet, and claims it first (confirmation_sent_at), so calling it
// again or guessing ids does nothing.
//
// From:     "<Agent> via EstateKit" <hello@mail.estatekit.co>  (verified in Resend)
// Reply-To: the agent's own email, so replies reach the agent.
// The main button opens WhatsApp to the agent with a pre-filled message: the
// lead starts the conversation, which needs no WhatsApp Business API.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const FROM_ADDRESS = "hello@mail.estatekit.co";
const PRIVACY_URL = "https://leads.estatekit.co/privacy";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const first = (s: string | null | undefined) => (s || "").trim().split(/\s+/)[0] || "";
const digits = (s: string | null | undefined) => {
  const d = (s || "").replace(/\D/g, "");
  return d.length === 10 && d.startsWith("0") ? "27" + d.slice(1) : d;
};
const prettyPhone = (s: string) => {
  const d = digits(s);
  return d.length === 11 && d.startsWith("27") ? `0${d.slice(2, 4)} ${d.slice(4, 7)} ${d.slice(7)}` : s;
};
const httpsOnly = (u: string | null | undefined) => (u && /^https:\/\//i.test(u) ? u : "");

type Kind = "seller" | "buyer" | "general";
const WORDING: Record<Kind, { request: string; subject: (area: string) => string; body: (addr: string) => string; wa: (addr: string) => string }> = {
  seller: {
    request: "home evaluation",
    subject: (area) => `Your ${area ? area + " " : ""}home evaluation request`,
    body: (addr) => `Thanks for requesting a free home evaluation${addr ? ` for <strong>${esc(addr)}</strong>` : ""}. I've received your details and I'll be in touch shortly to confirm a few things about your property.`,
    wa: (addr) => `I just requested a home evaluation${addr ? ` for ${addr}` : ""}.`,
  },
  buyer: {
    request: "property search",
    subject: (area) => `Your ${area ? area + " " : ""}property search`,
    body: () => "Thanks for getting in touch about finding your next home. I've received your details and I'll be in touch shortly.",
    wa: () => "I just sent you my details about finding a home.",
  },
  general: {
    request: "enquiry",
    subject: () => "We've received your details",
    body: () => "Thanks for getting in touch. I've received your details and I'll be in touch shortly.",
    wa: () => "I just sent you my details.",
  },
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return json({ ok: true, skipped: "RESEND_API_KEY not set" });

  let id = "";
  try {
    id = String((await req.json())?.id || "");
  } catch { /* fall through */ }
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "bad id" }, 400);

  // Claim it: only one caller ever gets the row back.
  const { data: claimed, error } = await supabase
    .from("leads")
    .update({ confirmation_sent_at: new Date().toISOString() })
    .eq("id", id)
    .is("confirmation_sent_at", null)
    .gt("created_at", new Date(Date.now() - 15 * 60_000).toISOString())
    .not("email", "is", null)
    .select("name, email, agent_id, pipeline_id, source_page_id, form_answers");
  if (error) {
    console.error("claim failed", error);
    return json({ error: "claim failed" }, 500);
  }
  const lead = claimed?.[0];
  if (!lead || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email || "")) return json({ ok: true, skipped: "already sent, too old or no email" });

  const [{ data: agent }, { data: pipeline }, { data: page }] = await Promise.all([
    supabase.from("agent_profiles").select("display_name, company, email, whatsapp_number, avatar_url, sidebar_logo_url, lead_confirmation_email").eq("agent_id", lead.agent_id).maybeSingle(),
    supabase.from("pipelines").select("kind").eq("id", lead.pipeline_id).maybeSingle(),
    lead.source_page_id
      ? supabase.from("lead_pages").select("agent_name, suburb, accent_color, phone").eq("id", lead.source_page_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (!agent?.lead_confirmation_email) return json({ ok: true, skipped: "switched off for this agent" });

  const kind: Kind = pipeline?.kind === "buyer" ? "buyer" : pipeline?.kind === "general" ? "general" : "seller";
  const w = WORDING[kind];
  const agentName = (page?.agent_name || agent.display_name || "").trim() || "Your agent";
  const agentFirst = first(agentName) || agentName;
  const leadFirst = first(lead.name) || "there";
  const area = (page?.suburb || "").split(/[,/•|;]/)[0].trim();
  const answers = Array.isArray(lead.form_answers) ? (lead.form_answers as { q?: string; a?: string }[]) : [];
  const address = (answers.find((x) => /address/i.test(x.q || ""))?.a || "").trim().slice(0, 160);
  const agentPhone = digits(page?.phone || agent.whatsapp_number);
  const accent = /^#[0-9a-f]{6}$/i.test(page?.accent_color || "") ? page!.accent_color! : "#1976d2";
  const photo = httpsOnly(agent.avatar_url) || httpsOnly(agent.sidebar_logo_url);
  const replyTo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(agent.email || "") ? agent.email : undefined;

  const waText = `Hi ${agentFirst}, it's ${first(lead.name) || lead.name}. ${w.wa(address)}`;
  const waUrl = agentPhone ? `https://wa.me/${agentPhone}?text=${encodeURIComponent(waText)}` : "";

  const subject = `${w.subject(area)} · ${agentName}`;
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f1f3f4;font-family:Roboto,Arial,Helvetica,sans-serif;color:#202124">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f3f4;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e0e0e0">
<tr><td style="height:4px;background:${accent}"></td></tr>
<tr><td style="padding:28px 28px 8px">
  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
    ${photo ? `<td style="padding-right:14px"><img src="${esc(photo)}" width="56" height="56" alt="" style="display:block;border-radius:50%;object-fit:cover"></td>` : ""}
    <td><div style="font-size:17px;font-weight:600">${esc(agentName)}</div>${agent.company ? `<div style="font-size:14px;color:#5f6368">${esc(agent.company)}</div>` : ""}</td>
  </tr></table>
</td></tr>
<tr><td style="padding:16px 28px 0;font-size:16px;line-height:1.55">
  <p style="margin:0 0 12px">Hi ${esc(leadFirst)},</p>
  <p style="margin:0 0 20px">${w.body(address)}</p>
  ${waUrl ? `<p style="margin:0 0 8px;color:#5f6368;font-size:14px">Want to get started sooner? Send me a message:</p>
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px"><tr><td style="background:#25D366;border-radius:6px">
    <a href="${esc(waUrl)}" style="display:inline-block;padding:14px 22px;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none">Message ${esc(agentFirst)} on WhatsApp</a>
  </td></tr></table>` : ""}
  <p style="margin:0 0 24px;font-size:14px;color:#5f6368">
    ${agentPhone ? `Call: <a href="tel:+${agentPhone}" style="color:${accent}">${esc(prettyPhone(agentPhone))}</a>` : ""}
    ${agentPhone && replyTo ? " &nbsp;·&nbsp; " : ""}
    ${replyTo ? `Email: <a href="mailto:${esc(replyTo)}" style="color:${accent}">${esc(replyTo)}</a>` : ""}
  </p>
</td></tr>
<tr><td style="padding:16px 28px 24px;border-top:1px solid #eeeeee;font-size:12px;line-height:1.5;color:#80868b">
  You're receiving this because you asked for a ${w.request} from ${esc(agentName)}. This is a one-off confirmation, not a newsletter.
  <a href="${PRIVACY_URL}" style="color:#80868b">Privacy Policy</a>
</td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    `Hi ${leadFirst},`,
    "",
    w.body(address).replace(/<[^>]+>/g, ""),
    "",
    waUrl ? `Want to get started sooner? Message ${agentFirst} on WhatsApp: ${waUrl}` : "",
    agentPhone ? `Call: ${prettyPhone(agentPhone)}` : "",
    replyTo ? `Email: ${replyTo}` : "",
    "",
    `${agentName}${agent.company ? `, ${agent.company}` : ""}`,
    "",
    `You're receiving this because you asked for a ${w.request} from ${agentName}. This is a one-off confirmation, not a newsletter. Privacy Policy: ${PRIVACY_URL}`,
  ].filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `${agentName.replace(/["<>]/g, "")} via EstateKit <${FROM_ADDRESS}>`,
      to: [lead.email],
      ...(replyTo ? { reply_to: replyTo } : {}),
      subject,
      html,
      text,
    }),
  });
  const body = await res.text();
  if (!res.ok) {
    console.error("resend failed", res.status, body);
    // Un-mark it, so it is never recorded as sent when it wasn't.
    await supabase.from("leads").update({ confirmation_sent_at: null }).eq("id", id);
    return json({ ok: false, status: res.status }, 502);
  }
  console.log("lead confirmation sent", id);
  return json({ ok: true });
});

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
// Opens are counted by a 1px image (leads.estatekit.co/o/<lead id> → email-open).
// The main button opens WhatsApp to the agent with a pre-filled message: the
// lead starts the conversation, which needs no WhatsApp Business API.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const FROM_ADDRESS = "hello@mail.estatekit.co";
const PRIVACY_URL = "https://leads.estatekit.co/privacy";
const APP = "https://leads.estatekit.co";

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

// The standard main text for seller leads, the same for every agent. An
// operator can give one agent their own (agent_profiles.lead_email_body).
// KEEP IN STEP with src/lib/leadEmail.ts (the Forms page preview).
const STANDARD_SELLER_BODY = [
  "Thanks for requesting a free home evaluation for {address}. I'm working on it now.",
  "When your evaluation is ready, I'll be in touch to go through what your home could be worth, and whether I have buyers looking in the area.",
].join("\n\n");

function fillLeadEmail(text: string, v: { name: string; address: string; agent: string }): string[] {
  return (text || STANDARD_SELLER_BODY)
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 6)
    .map((p) =>
      p
        .replaceAll("{name}", v.name || "there")
        .replaceAll("{address}", v.address || "your home")
        .replaceAll("{agent}", v.agent || "I"),
    );
}

// The form's lead magnet (Forms → the form → Lead magnet): a box after the
// first paragraph with the same headline, line and button as the thank-you
// page card. Not set = the marketing plan for sellers, nothing otherwise.
// KEEP IN STEP with src/lib/leadMagnet.ts (MAGNET_PRESETS and resolveMagnet).
type MagnetKind = "none" | "plan" | "pdf";
const MAGNET_DEFAULTS: Record<"plan" | "pdf", { title: string; text: string; button: string }> = {
  plan: { title: "Your marketing plan is ready", text: "How to sell your home without losing money or time. A 2-minute read.", button: "Open my marketing plan" },
  pdf: { title: "Your free guide", text: "", button: "Open it" },
};
interface PageMagnet { magnet_kind?: MagnetKind | null; magnet_title?: string | null; magnet_text?: string | null; magnet_button?: string | null; magnet_pdf_url?: string | null }

function resolveMagnet(page: PageMagnet | null, pipelineKind: string) {
  let kind: MagnetKind = page?.magnet_kind ?? (pipelineKind === "seller" ? "plan" : "none");
  if (kind === "pdf" && !page?.magnet_pdf_url) kind = "none";
  if (kind === "none") return null;
  const d = MAGNET_DEFAULTS[kind];
  return {
    title: page?.magnet_title?.trim() || d.title,
    text: page?.magnet_text?.trim() || d.text,
    button: page?.magnet_button?.trim() || d.button,
  };
}

function magnetBlockHtml(url: string, m: { title: string; text: string; button: string }): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:4px 0 18px;border-collapse:collapse"><tr><td style="border-left:4px solid #1565c0;background:#eef4fc;padding:14px 16px">
<p style="margin:0 0 6px;font-size:16px;font-weight:bold;color:#111111;line-height:1.35">${esc(m.title)}</p>
${m.text ? `<p style="margin:0 0 8px">${esc(m.text)}</p>` : ""}
<p style="margin:10px 0 0"><a href="${esc(url)}" style="color:#1565c0;font-weight:bold;font-size:16px">${esc(m.button)} &rarr;</a></p>
</td></tr></table>`;
}

function magnetBlockText(url: string, m: { title: string; text: string; button: string }): string[] {
  return [m.title.toUpperCase(), ...(m.text ? [m.text] : []), `${m.button}: ${url}`];
}

type Kind = "seller" | "buyer" | "general";
// The seller copy gives the lead a reason to pick up the agent's call (their
// home's value, and whether there are buyers nearby) instead of "confirming
// details". "Whether", because it has to be true for every agent.
const WORDING: Record<Kind, { request: string; subject: (area: string) => string; body: (addr: string, area: string) => string[]; wa: (addr: string) => string }> = {
  seller: {
    request: "home evaluation",
    subject: (area) => `Your ${area ? area + " " : ""}home evaluation request`,
    body: (addr) => [
      `Thanks for requesting a free home evaluation${addr ? ` for ${esc(addr)}` : ""}.`,
      "I'm having a look at what's sold near you recently.",
      "I'll be in touch shortly to go through what your home could be worth, and whether I have buyers looking in the area.",
    ],
    wa: (addr) => `I just requested a home evaluation${addr ? ` for ${addr}` : ""}.`,
  },
  buyer: {
    request: "property search",
    subject: (area) => `Your ${area ? area + " " : ""}property search`,
    body: () => ["Thanks for getting in touch about finding your next home.", "I've received your details and I'll be in touch shortly."],
    wa: () => "I just sent you my details about finding a home.",
  },
  general: {
    request: "enquiry",
    subject: () => "We've received your details",
    body: () => ["Thanks for getting in touch.", "I've received your details and I'll be in touch shortly."],
    wa: () => "I just sent you my details.",
  },
};

/** Adds a line to the lead's history (Leads → lead → History). */
async function logHistory(leadId: string, agentId: string, ok: boolean, detail: string) {
  const { error } = await supabase.from("lead_events").insert({
    lead_id: leadId,
    agent_id: agentId,
    event_type: ok ? "email_sent" : "email_failed",
    to_value: detail,
    source: "automation",
  });
  if (error) console.error("history log failed", error);
}

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
    .select("name, email, agent_id, pipeline_id, source_page_id, form_answers, plan_token");
  if (error) {
    console.error("claim failed", error);
    return json({ error: "claim failed" }, 500);
  }
  const lead = claimed?.[0];
  if (!lead) return json({ ok: true, skipped: "already sent or too old" });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email || "")) {
    await logHistory(id, lead.agent_id, false, `Email address looks wrong: ${String(lead.email).slice(0, 80)}`);
    return json({ ok: true, skipped: "invalid email" });
  }

  const [{ data: agent }, { data: pipeline }, { data: page }] = await Promise.all([
    supabase.from("agent_profiles").select("display_name, company, email, whatsapp_number, lead_confirmation_email, lead_email_body").eq("agent_id", lead.agent_id).maybeSingle(),
    supabase.from("pipelines").select("kind").eq("id", lead.pipeline_id).maybeSingle(),
    lead.source_page_id
      ? supabase.from("lead_pages").select("agent_name, suburb, accent_color, phone, magnet_kind, magnet_title, magnet_text, magnet_button, magnet_pdf_url").eq("id", lead.source_page_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (!agent?.lead_confirmation_email) return json({ ok: true, skipped: "switched off for this agent" });
  const { count: salesCount } = await supabase.from("sold_listings").select("id", { count: "exact", head: true }).eq("agent_id", lead.agent_id);

  const kind: Kind = pipeline?.kind === "buyer" ? "buyer" : pipeline?.kind === "general" ? "general" : "seller";
  const w = WORDING[kind];
  // A person, not a brand: the page's "agent name" is sometimes the agency
  // (e.g. "Hannaford Homes"), so the profile's name comes first.
  const agentName = (agent.display_name || page?.agent_name || "").trim() || "Your agent";
  const agentFirst = first(agentName) || agentName;
  const brand = (agent.company || (page?.agent_name && page.agent_name !== agentName ? page.agent_name : "") || "").trim();
  const leadFirst = first(lead.name) || "there";
  const area = (page?.suburb || "").split(/[,/•|;]/)[0].trim();
  const answers = Array.isArray(lead.form_answers) ? (lead.form_answers as { q?: string; a?: string }[]) : [];
  const rawAddress = (answers.find((x) => /address/i.test(x.q || ""))?.a || "").trim().slice(0, 160);
  // Typed in all lowercase ("12 long kloof midrand") reads as careless when
  // quoted back; tidy it to "12 Long Kloof Midrand". Anything with capitals is
  // left as they wrote it.
  const address = rawAddress === rawAddress.toLowerCase() ? rawAddress.replace(/\b([a-z])/g, (m) => m.toUpperCase()) : rawAddress;
  // WhatsApp only works to a cellphone, so use the agent's WhatsApp number
  // (a page's number can be an office landline). Calls can use either.
  // WhatsApp needs a cellphone. South African numbers must be mobiles (06/07/08,
  // not an 010/011 office line); other countries (e.g. Namibia +264) are accepted.
  const isMobile = (d: string) => (d.startsWith("27") ? /^27[6-8]\d{8}$/.test(d) : /^[1-9]\d{8,14}$/.test(d));
  const waNumber = [digits(agent.whatsapp_number), digits(page?.phone)].find(isMobile) || "";
  const callNumber = digits(page?.phone || agent.whatsapp_number);
  const replyTo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(agent.email || "") ? agent.email : undefined;

  const waText = `Hi ${agentFirst}, it's ${first(lead.name) || lead.name}. ${w.wa(address)}`;
  void waText; // built again by email-click, which is what the link opens
  const waUrl = waNumber ? `${APP}/w/${id}` : "";
  // The lead magnet opens through the lead's own link (/plan/<token>): the
  // personal marketing plan, or the form's PDF. The token is random because
  // the plan shows their name and address. Leads from a lead page already
  // have one (the thank-you page links to it too), so the email uses the
  // same link; other leads (Facebook forms) get one made here.
  const magnet = resolveMagnet(page as PageMagnet | null, pipeline?.kind ?? "seller");
  let planUrl = "";
  if (magnet) {
    if (lead.plan_token) {
      planUrl = `${APP}/plan/${lead.plan_token}`;
    } else {
      const token = crypto.randomUUID().replace(/-/g, "");
      const { error: tokErr } = await supabase.from("leads").update({ plan_token: token }).eq("id", id);
      if (!tokErr) planUrl = `${APP}/plan/${token}`;
    }
  }
  // Other leads (no plan) still get the recent-sales page when there is one.
  const salesUrl = !planUrl && kind === "seller" && (salesCount ?? 0) > 0 ? `${APP}/sold/${lead.agent_id}` : "";

  const paragraphs: string[] =
    kind === "seller"
      ? fillLeadEmail(agent.lead_email_body || "", { name: leadFirst, address, agent: agentFirst }).map(esc)
      : w.body(address, area);

  // The lead magnet's box goes straight after the first paragraph.
  const htmlBlocks = paragraphs.map((t) => `<p style="margin:0 0 14px">${t}</p>`);
  const textBlocks = paragraphs.map((t) => t.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'"));
  if (planUrl && magnet && paragraphs.length) {
    htmlBlocks.splice(1, 0, magnetBlockHtml(planUrl, magnet));
    textBlocks.splice(1, 0, magnetBlockText(planUrl, magnet).join("\n"));
  }

  // Personal subject, no brand suffix: the From line already says who it is.
  const subject = kind === "seller" && address ? `Your home evaluation for ${address}` : w.subject(area);

  // Deliberately plain: it should read like an email the agent typed, not a
  // newsletter. No banner, logo or big buttons (those also tend to land in
  // Gmail's Promotions tab). The one exception is the plain lead magnet box.
  const p = 'style="margin:0 0 14px"';
  const html = `<!doctype html><html><body style="margin:0;padding:16px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#222222">
<div style="max-width:560px">
<p ${p}>Hi ${esc(leadFirst)},</p>
${htmlBlocks.join("\n")}
${salesUrl ? `<p ${p}>In the meantime, <a href="${esc(salesUrl)}" style="color:#1a73e8">here are some homes I've sold recently</a>.</p>` : ""}
${waUrl ? `<p ${p}>If it's easier, you can <a href="${esc(waUrl)}" style="color:#1a73e8">message me on WhatsApp here</a>.</p>` : ""}
<p style="margin:18px 0 0">${esc(agentFirst)}</p>
<p style="margin:6px 0 0;font-size:13px;color:#555555;line-height:1.5">
${esc(agentName)}${brand ? ` · ${esc(brand)}` : ""}<br>
${callNumber ? `<a href="tel:+${callNumber}" style="color:#555555">${esc(prettyPhone(callNumber))}</a>` : ""}${callNumber && replyTo ? " · " : ""}${replyTo ? `<a href="mailto:${esc(replyTo)}" style="color:#555555">${esc(replyTo)}</a>` : ""}
</p>
<p style="margin:28px 0 0;font-size:11px;color:#999999;line-height:1.5">
You're getting this because you asked ${esc(agentName)} for a ${w.request}. It's a one-off confirmation, not a newsletter. <a href="${PRIVACY_URL}" style="color:#999999">Privacy Policy</a>
</p>
<img src="${APP}/o/${id}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0">
</div></body></html>`;

  const text = [
    `Hi ${leadFirst},`,
    "",
    ...textBlocks.flatMap((t) => [t, ""]),
    "",
    salesUrl ? `In the meantime, here are some homes I've sold recently: ${salesUrl}` : "",
    waUrl ? `If it's easier, you can message me on WhatsApp here: ${waUrl}` : "",
    "",
    agentFirst,
    `${agentName}${brand ? ` · ${brand}` : ""}`,
    [callNumber ? prettyPhone(callNumber) : "", replyTo || ""].filter(Boolean).join(" · "),
    "",
    `You're getting this because you asked ${agentName} for a ${w.request}. It's a one-off confirmation, not a newsletter. Privacy Policy: ${PRIVACY_URL}`,
  ].filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `${agentName.replace(/["<>]/g, "")} <${FROM_ADDRESS}>`,
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
    await logHistory(id, lead.agent_id, false, `Not delivered to ${lead.email} (email service error ${res.status})`);
    return json({ ok: false, status: res.status }, 502);
  }
  try {
    const resendId = (JSON.parse(body) as { id?: string }).id;
    if (resendId) await supabase.from("leads").update({ confirmation_email_id: resendId }).eq("id", id);
  } catch { /* the email still went; only its later reports won't match */ }
  await logHistory(id, lead.agent_id, true, `To ${lead.email}`);
  console.log("lead confirmation sent", id);
  return json({ ok: true });
});

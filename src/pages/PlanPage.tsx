import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../api/_client";
import "./plan.css";

// The "Marketing Plan" linked from the confirmation email
// (leads.estatekit.co/plan/<token>). One standard plan for every seller and
// every agent (Bennie, Sept 2026: keep it simple, people don't read long
// plans). Only their name, address and one timing tip are personal.
// Every line must be true for every agent: agent-specific promises (show
// house, paying for certificates...) need a per-agent opt-in first.
// Real proof only: the agent's own recent sales, no invented testimonials,
// and no generated signature.
//
// /plan/sample/<agent id>: the same page with the agent's real details and a
// made-up seller, opened from the Forms page so agents see what sellers get.
// Only for the agent themselves or an operator; nothing is logged.

const TITLE = "Your Marketing Plan";

interface Plan {
  lead_id: string;
  lead_name: string;
  address: string;
  reason: string;
  timeline: string;
  date: string;
  agent_name: string;
  company: string;
  agent_email: string;
  agent_phone: string;
  photo: string | null;
  accent: string;
  page_slug: string | null;
  sales: { address: string; price: number | null; status: string; image_url: string | null }[];
  /** "pdf": the form's lead magnet is a PDF; only pdf_url and title come back. */
  kind?: "plan" | "pdf";
  pdf_url?: string | null;
  title?: string;
}

type TimeKey = "asap" | "1-3" | "3-6" | "6-12" | "notsure";

const TIMES: Record<TimeKey, { label: string; tipTitle: string; tip: string }> = {
  asap: {
    label: "As soon as possible",
    tipTitle: "Do this this week",
    tip: "If you have a bond, tell your bank you are selling. The bank needs 90 days (3 months) of notice. This is what slows down most quick sales.",
  },
  "1-3": {
    label: "In 1 to 3 months",
    tipTitle: "Tell your bank now",
    tip: "If you have a bond, the bank needs 90 days (3 months) of notice before you sell. You plan to sell sooner than that. Tell them when the house goes on the market, or you may pay a penalty.",
  },
  "3-6": {
    label: "In 3 to 6 months",
    tipTitle: "Use this time",
    tip: "You have time to fix small things, like broken lights and leaking taps. Buyers notice these. I can tell you which fixes are worth it.",
  },
  "6-12": {
    label: "In 6 to 12 months",
    tipTitle: "No rush",
    tip: "You have time on your side. Knowing your home's value now helps you pick the right moment to sell.",
  },
  notsure: {
    label: "Not decided yet",
    tipTitle: "No rush",
    tip: "You do not need to decide today. Knowing what your house is worth makes the choice much easier.",
  },
};

function timeKey(t: string): TimeKey {
  const s = t.toLowerCase();
  if (s.startsWith("as soon") || s.startsWith("immediately")) return "asap";
  if (s.startsWith("1 –") || s.startsWith("1-")) return "1-3";
  if (s.startsWith("3 –") || s.startsWith("3-")) return "3-6";
  if (s.startsWith("6 –") || s.startsWith("6-") || s.startsWith("12")) return "6-12";
  return "notsure";
}

const tidy = (a: string) => (a === a.toLowerCase() ? a.replace(/\b([a-z])/g, (m) => m.toUpperCase()) : a);
const money = (n: number | null) => (n ? "R " + n.toLocaleString("en-ZA") : "");
const digits = (s: string) => {
  const d = (s || "").replace(/\D/g, "");
  return d.length === 10 && d.startsWith("0") ? "27" + d.slice(1) : d;
};
const prettyPhone = (s: string) => {
  const d = digits(s);
  return d.length === 11 && d.startsWith("27") ? `0${d.slice(2, 4)} ${d.slice(4, 7)} ${d.slice(7)}` : s;
};

/** `from` = where the link was opened ("thanks" = the thank-you page; none =
 *  the email), so the lead's history says which. */
async function getPlan(token: string, from: string | null): Promise<Plan | null> {
  const { data, error } = await supabase.rpc("open_selling_plan", { p_token: token, p_from: from });
  if (error) throw new Error(error.message);
  return (data as Plan) ?? null;
}

/** From the thank-you page the plan can be opened a moment before the lead
 *  has finished saving, so wait a few seconds for it before giving up. */
async function getPlanPatiently(token: string, from: string | null): Promise<Plan | null> {
  for (let i = 0; ; i++) {
    const plan = await getPlan(token, from);
    if (plan || from !== "thanks" || i >= 6) return plan;
    await new Promise((r) => setTimeout(r, 1000));
  }
}

async function getSamplePlan(agentId: string): Promise<Plan | null> {
  const { data, error } = await supabase.rpc("get_sample_selling_plan", { p_agent: agentId });
  if (error) throw new Error(error.message);
  return (data as Plan) ?? null;
}

export default function PlanPage() {
  const { token = "", agentId = "" } = useParams();
  const [params] = useSearchParams();
  const from = params.get("from") === "thanks" ? "thanks" : null;
  const sample = !!agentId;
  const valid = sample ? /^[0-9a-f-]{36}$/i.test(agentId) : /^[a-f0-9]{32}$/.test(token);
  // Read once: every load would otherwise count as another open.
  const { data: plan, isLoading, isError } = useQuery({
    queryKey: sample ? ["samplePlan", agentId] : ["plan", token],
    queryFn: () => (sample ? getSamplePlan(agentId) : getPlanPatiently(token, from)),
    enabled: valid,
    staleTime: Infinity,
    retry: 1,
  });

  const t = TIMES[timeKey(plan?.timeline || "")];
  useEffect(() => {
    if (plan) document.title = `${TITLE} · ${plan.agent_name}`;
  }, [plan]);

  if (!valid || isError || (!isLoading && !plan)) {
    return (
      <div className="plan-viewer">
        <div className="plan-page plan-missing">
          <h1>This plan isn't available</h1>
          <p>{sample ? "Log in to EstateKit first, then open the sample again from your Forms page." : "The link may be incomplete. Check the email you received, or contact your agent."}</p>
        </div>
      </div>
    );
  }
  if (isLoading || !plan) return <div className="plan-viewer"><div className="plan-page plan-loading" /></div>;
  if (plan.kind === "pdf") return <PdfRedirect url={plan.pdf_url ?? ""} title={plan.title ?? ""} />;

  const agentFirst = plan.agent_name.split(/\s+/)[0] || "your agent";
  const initials = plan.agent_name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const phone = digits(plan.agent_phone);
  const waUrl = phone ? (sample ? `https://wa.me/${phone}` : `/w/${plan.lead_id}/plan`) : "";
  const address = tidy(plan.address);
  // Stable for this lead, so it reads the same every time they open it.
  const ref = `EK-${(plan.date.match(/\d{4}$/) || [""])[0]}-${plan.lead_id.replace(/-/g, "").slice(0, 5).toUpperCase()}`;

  return (
    <div className="plan-viewer" style={{ ["--accent" as string]: plan.accent }}>
      <div className="plan-bar">
        <span className="plan-file">{sample ? "Sample: what your sellers get (made-up seller, your details)" : TITLE}</span>
        <button type="button" onClick={() => window.print()}>Save as PDF</button>
      </div>

      <article className="plan-page">
        <header className="plan-letterhead">
          <div className="plan-agent">
            {plan.photo ? <img className="plan-photo" src={plan.photo} alt="" /> : <div className="plan-photo">{initials}</div>}
            <div>
              <p className="plan-agent-name">{plan.agent_name}</p>
              <p className="plan-agent-co">Registered Property Practitioner (PPRA)</p>
              {plan.company && <p className="plan-agent-co">{plan.company}</p>}
            </div>
          </div>
          <div className="plan-ref">
            Ref: <b>{ref}</b>
            <br />
            Date: <b>{plan.date}</b>
            <br />
            Status: <b>In progress</b>
          </div>
        </header>

        <div className="plan-status" role="status">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#fff" /><path d="M6.5 12.5l3.5 3.5 7.5-8" fill="none" stroke="#1565c0" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <div>
            <p className="plan-status-title">Your home evaluation is being prepared</p>
            <p>{agentFirst} is working on it now. While you wait, here is how I'll sell your home.</p>
          </div>
        </div>

        <h1>{TITLE}</h1>
        <p className="plan-sub"><b>How I'll sell your home, what to have ready, and the one thing to do now.</b></p>

        <table className="plan-facts">
          <tbody>
            <tr><th scope="row">Prepared for</th><td>{plan.lead_name || "You"}</td></tr>
            {address && <tr><th scope="row">Property</th><td>{address}</td></tr>}
            <tr><th scope="row">When you want to sell</th><td>{t.label}</td></tr>
          </tbody>
        </table>

        <h2><span>1.</span> How I'll sell your home</h2>
        <ul className="plan-why">
          <li><b>You pay nothing until your home is sold.</b> My commission is only paid on transfer.</li>
          <li><b>The right asking price, from real sales.</b> Homes that start too high take longer, sell for less, or go stale.</li>
          <li><b>Marketed online, and to buyers I'm already talking to</b> in your area.</li>
          <li><b>I handle the viewings and the offers</b>, so you don't have to.</li>
          <li><b>You choose the attorney.</b> If you don't have one, I can recommend attorneys I trust.</li>
          <li><b>Regular updates</b> on who viewed your home and what they said.</li>
        </ul>

        <h2><span>2.</span> Documents to have ready</h2>
        <ul className="plan-papers">
          <li>Your ID (and your spouse's ID, if you are married in community of property)</li>
          <li>Proof of address (a utility bill, or any account with your address on it)</li>
          <li>Your latest rates bill from the municipality</li>
          <li>Your levy statement (only for a sectional title)</li>
        </ul>
        <p className="plan-small">
          Certificates for electrical, gas, an electric fence or solar come later. The attorney asks for them after the sale is signed. I will
          help you arrange them.
        </p>

        <h2><span>3.</span> The one thing to do now</h2>
        <div className="plan-notice" role="note">
          <p className="plan-notice-title">{t.tipTitle}</p>
          <p>{t.tip}</p>
        </div>

        {plan.sales.length > 0 && (
          <>
            <h2><span>4.</span> Homes I've sold recently</h2>
            <ul className="plan-sales">
              {plan.sales.map((s, i) => (
                <li key={i}>
                  {s.image_url && <img src={s.image_url} alt="" />}
                  <div>
                    <b>{s.address}</b>
                    <span>{[s.status === "sold" ? "Sold" : "Listed", money(s.price)].filter(Boolean).join(" · ")}</span>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}

        <section className="plan-next">
          <h3>Book your free consultation</h3>
          <p>When we speak, I'll go through your price and exactly how I'll market your home. Tell me when suits you for a quick call or visit.</p>
          {waUrl && (
            <a className="plan-wa" href={waUrl} target="_blank" rel="noopener">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#fff" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.4.8 3.2.7.5-.1 1.5-.6 1.8-1.2s.2-1.1.1-1.2l-.4-.3z"/></svg>
              Book my free consultation
            </a>
          )}
          {phone && <p className="plan-tel">Or phone {agentFirst}: <b>{prettyPhone(plan.agent_phone)}</b></p>}
          {plan.agent_email && <p className="plan-tel">Email: <a href={`mailto:${plan.agent_email}`}>{plan.agent_email}</a></p>}
          {waUrl && <PlanQr url={waUrl.startsWith("http") ? waUrl : `https://leads.estatekit.co${waUrl}`} />}
        </section>

        <footer className="plan-sign">
          <p className="plan-sign-name">{plan.agent_name}</p>
          <p className="plan-small">{plan.company}</p>
          <p className="plan-small">Free. You do not have to sell.</p>
        </footer>

        <p className="plan-foot">General guidance only. Your attorney and bank will confirm the details for your sale.</p>
      </article>
    </div>
  );
}

/** "Scan to WhatsApp me": for the saved PDF and computer screens only.
 *  Hidden on phones, where the button is the way in. */
function PlanQr({ url }: { url: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    QRCode.toDataURL(url, { margin: 1, width: 240, errorCorrectionLevel: "M" }).then(setSrc).catch(() => setSrc(""));
  }, [url]);
  if (!src) return null;
  return (
    <div className="plan-qr">
      <img src={src} alt="" />
      <span>Scan with your phone
        <br />to WhatsApp me</span>
    </div>
  );
}

/** A PDF lead magnet: the open is already logged (open_selling_plan), so go
 *  straight on to the PDF. The link stays for the odd browser that blocks it. */
function PdfRedirect({ url, title }: { url: string; title: string }) {
  const ok = /^https:\/\//.test(url);
  useEffect(() => {
    if (ok) window.location.replace(url);
  }, [ok, url]);
  return (
    <div className="plan-viewer">
      <div className="plan-page plan-missing">
        <h1>{ok ? "Opening your guide…" : "This guide isn't available"}</h1>
        {ok && <p><a href={url}>Tap here if it doesn't open{title ? `: ${title}` : ""}</a></p>}
      </div>
    </div>
  );
}

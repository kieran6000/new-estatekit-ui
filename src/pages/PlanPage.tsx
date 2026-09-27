import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../api/_client";
import "./plan.css";

// The personal "Selling Plan" linked from the confirmation email
// (leads.estatekit.co/plan/<token>). Built from the lead's own answers: the
// reason for selling picks the steps, the timeline picks the urgent tip.
// The same wording for every agent; only the agent's details and the lead's
// answers change. Real proof only: the agent's own recent sales, no invented
// testimonials, and no generated signature.

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
}

type ReasonKey = "downsizing" | "relocating" | "upgrading" | "inherited" | "financial" | "unknown";
type TimeKey = "asap" | "1-3" | "3-6" | "6-12" | "notsure";

const REASONS: Record<ReasonKey, { title: string; intro: string; steps: [string, string][]; next: string }> = {
  downsizing: {
    title: "Your Downsizing Plan",
    intro: "You want a smaller home. Most people shop for the new place first. That is the wrong order.",
    steps: [
      ["Find out your real number", "Your selling price, minus the costs, is the money you get. I will work this out with you."],
      ["Sell first, then buy", "When your house is sold, you know exactly how much money you have for the next place."],
      ["Plan one move, not two", "We pick the moving date so you move out and move in on the same day."],
    ],
    next: "Find out what your home is worth today. Then you know what you can spend on the next one.",
  },
  relocating: {
    title: "Your Moving Plan",
    intro: "You are moving away. You can sell your house without being here.",
    steps: [
      ["Set the right price from day one", "A house that does not sell keeps costing you money every month."],
      ["I show the house for you", "I handle the keys, the viewings and the buyers."],
      ["Sign from where you live", "You can sign the papers at an attorney close to your new home."],
    ],
    next: "Tell me your moving date. I will plan the sale around it.",
  },
  upgrading: {
    title: "Your Upgrade Plan",
    intro: "You want a bigger home. Sellers like buyers whose house is already sold.",
    steps: [
      ["Find out your real number", "The money you get from this house sets your budget for the next one."],
      ["Get an offer on your house first", "Then your offer on the new house is much stronger."],
      ["Match the dates", "So you do not pay two bonds at the same time."],
    ],
    next: "Find out what your home is worth today, so you know your budget.",
  },
  inherited: {
    title: "Your Estate Sale Plan",
    intro: "You inherited this house. I am sorry for your loss. Here is how the sale works.",
    steps: [
      ["The executor gets a letter", "The Master of the High Court gives the executor a Letter of Executorship. The sale can only finish after that."],
      ["Everyone who inherits must agree", "All the family members who inherit should agree on the sale and the price."],
      ["You can start now", "We can put the house on the market while the papers are being done."],
    ],
    next: "Tell me where the estate is right now. I will tell you what we can do today.",
  },
  financial: {
    title: "Your Selling Plan",
    intro: "If money is tight, acting early gives you more choices and a better price.",
    steps: [
      ["Talk to your bank early", "Banks are more helpful when you call them before payments are missed."],
      ["Find out your real number", "Know how much money you will have after the bond is paid off."],
      ["Sell on your terms", "A sale you choose gets a better price than a rushed one."],
    ],
    next: "This stays private. WhatsApp me for a free price and a simple plan.",
  },
  unknown: {
    title: "Your Selling Plan",
    intro: "Whatever your reason, these three things decide how much money you get.",
    steps: [
      ["Find out your real number", "Your price, minus the costs, is the money you get."],
      ["Start with the right price", "Houses that start too high take longer and sell for less."],
      ["Start the papers early", "Some papers take weeks. Starting early stops delays."],
    ],
    next: "Find out what your home is worth today. It is free.",
  },
};

const TIMES: Record<TimeKey, { label: string; tipTitle: string; tip: string }> = {
  asap: {
    label: "As soon as possible",
    tipTitle: "Do this this week",
    tip: "If you have a bond, tell your bank you are selling. The bank needs 90 days (3 months) of notice. Also book the electrician for your certificate. These two things slow down most quick sales.",
  },
  "1-3": {
    label: "In 1 to 3 months",
    tipTitle: "Tell your bank now",
    tip: "If you have a bond, the bank needs 90 days (3 months) of notice before you sell. You plan to sell sooner than that. Tell them when the house goes on the market, or you may pay a penalty.",
  },
  "3-6": {
    label: "In 3 to 6 months",
    tipTitle: "Use this time",
    tip: "You have time to fix small things, like broken lights and leaking taps. Inspectors and buyers notice these. I can tell you which fixes are worth it.",
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

function reasonKey(r: string): { key: ReasonKey; label: string | null } {
  const s = r.toLowerCase();
  if (s.startsWith("downsizing")) return { key: "downsizing", label: "Downsizing" };
  if (s.startsWith("retirement")) return { key: "downsizing", label: "Retiring" };
  if (s.startsWith("relocating")) return { key: "relocating", label: "Moving to a new area" };
  if (s.startsWith("emigrating")) return { key: "relocating", label: "Emigrating" };
  if (s.startsWith("upgrading")) return { key: "upgrading", label: "Upgrading to a bigger home" };
  if (s.startsWith("inherited")) return { key: "inherited", label: "Inherited the house" };
  if (s.startsWith("financial")) return { key: "financial", label: "Money reasons" };
  return { key: "unknown", label: null };
}

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

async function getPlan(token: string): Promise<Plan | null> {
  const { data, error } = await supabase.rpc("get_selling_plan", { p_token: token });
  if (error) throw new Error(error.message);
  return (data as Plan) ?? null;
}

export default function PlanPage() {
  const { token = "" } = useParams();
  const valid = /^[a-f0-9]{32}$/.test(token);
  // Read once: every load would otherwise count as another open.
  const { data: plan, isLoading, isError } = useQuery({ queryKey: ["plan", token], queryFn: () => getPlan(token), enabled: valid, staleTime: Infinity, retry: 1 });

  const reason = reasonKey(plan?.reason || "");
  const r = REASONS[reason.key];
  const t = TIMES[timeKey(plan?.timeline || "")];
  useEffect(() => {
    if (plan) document.title = `${r.title} · ${plan.agent_name}`;
  }, [plan, r.title]);

  if (!valid || isError || (!isLoading && !plan)) {
    return (
      <div className="plan-viewer">
        <div className="plan-page plan-missing">
          <h1>This plan isn't available</h1>
          <p>The link may be incomplete. Check the email you received, or contact your agent.</p>
        </div>
      </div>
    );
  }
  if (isLoading || !plan) return <div className="plan-viewer"><div className="plan-page plan-loading" /></div>;

  const agentFirst = plan.agent_name.split(/\s+/)[0] || "your agent";
  const initials = plan.agent_name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const phone = digits(plan.agent_phone);
  const waUrl = phone ? `/w/${plan.lead_id}` : "";
  const address = tidy(plan.address);

  return (
    <div className="plan-viewer" style={{ ["--accent" as string]: plan.accent }}>
      <div className="plan-bar">
        <span className="plan-file">{r.title}</span>
        <button type="button" onClick={() => window.print()}>Save as PDF</button>
      </div>

      <article className="plan-page">
        <header className="plan-letterhead">
          <div className="plan-agent">
            {plan.photo ? <img className="plan-photo" src={plan.photo} alt="" /> : <div className="plan-photo">{initials}</div>}
            <div>
              <p className="plan-agent-name">{plan.agent_name}</p>
              {plan.company && <p className="plan-agent-co">{plan.company}</p>}
            </div>
          </div>
          <div className="plan-ref">Date: <b>{plan.date}</b></div>
        </header>

        <div className="plan-status">
          <b>Your home evaluation is being prepared.</b> While you wait, here is your plan.
        </div>

        <h1>{r.title}</h1>
        <p className="plan-sub"><b>3 steps to sell your home without losing money or time.</b> Made for you, from what you told me.</p>

        <table className="plan-facts">
          <tbody>
            <tr><th scope="row">Prepared for</th><td>{plan.lead_name || "You"}</td></tr>
            {address && <tr><th scope="row">Property</th><td>{address}</td></tr>}
            {reason.label && <tr><th scope="row">Why you want to sell</th><td>{reason.label}</td></tr>}
            <tr><th scope="row">When</th><td>{t.label}</td></tr>
          </tbody>
        </table>

        <h2><span>1.</span> What to do, in this order</h2>
        <p>{r.intro}</p>
        <ol className="plan-steps">
          {r.steps.map(([h, d]) => (
            <li key={h}><b>{h}</b>{d}</li>
          ))}
        </ol>

        <div className="plan-notice" role="note">
          <p className="plan-notice-title">{t.tipTitle}</p>
          <p>{t.tip}</p>
        </div>

        <h2><span>2.</span> Papers you will need</h2>
        <ul className="plan-papers">
          <li>Your ID (and your spouse's ID, if you are married in community of property)</li>
          <li>Proof of where you live, like a utility bill</li>
          <li>Your bond account number (only if you have a bond)</li>
          <li>Your latest rates bill from the municipality</li>
          <li>Levy statement (only for a flat or a house in a complex)</li>
          <li>Electrical compliance certificate (the law says you need one)</li>
        </ul>
        <p className="plan-small">
          Some homes need extra certificates, like for gas, an electric fence or, near the coast, a beetle certificate. I will tell you if yours does,
          and help you get everything.
        </p>

        {plan.sales.length > 0 && (
          <>
            <h2><span>3.</span> Homes I've sold recently</h2>
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
          <h3>Your next step</h3>
          <p>{r.next}</p>
          {waUrl && (
            <a className="plan-wa" href={waUrl} target="_blank" rel="noopener">WhatsApp {agentFirst}</a>
          )}
          {phone && <p className="plan-tel">Or phone: <b>{prettyPhone(plan.agent_phone)}</b></p>}
          {plan.agent_email && <p className="plan-tel">Email: <a href={`mailto:${plan.agent_email}`}>{plan.agent_email}</a></p>}
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

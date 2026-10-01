import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { listAgentProfiles } from "../api/_client";
import estateKitLogo from "../assets/blue logo full.png";
import "./report.css";

// The weekly performance report we send each client: one printable page,
// same plain style as the Selling Plan. Operators open it from a client's
// page (/report/<agent id>) and "Save as PDF".
//
// UI ONLY FOR NOW: the agent's name, company and photo are real, every number
// is SAMPLE data so the layout can be signed off before it's wired up. The
// numbers it will need, and where each comes from, are listed in WIRING below.
//
// WIRING (for the backend pass)
//   new leads, booked, mandates, waiting, no answer  get_agent_results(agent, 7) and (agent, 14) minus (agent, 7)
//   ad spend, per-ad leads/CPL                      fb-ad-insights for the week
//   called, spoke to, median time to first call     lead_events: first 'call' / 'stage_changed' per lead
//   leads still waiting (oldest 5)                  leads where stage = 'New Lead' order by created_at

interface Week {
  leads: number; spend: number; called: number; within5: number; spoke: number; booked: number; mandates: number; medianMins: number;
}

const THIS: Week = { leads: 34, spend: 1395, called: 27, within5: 12, spoke: 18, booked: 5, mandates: 1, medianMins: 7 };
const LAST: Week = { leads: 28, spend: 1288, called: 19, within5: 6, spoke: 13, booked: 3, mandates: 1, medianMins: 22 };

const WAITING = [
  { name: "Thandi M.", area: "Bryanston", days: 6, source: "Valuation form" },
  { name: "Pieter v. d. Merwe", area: "Fourways", days: 5, source: "Valuation form" },
  { name: "Lerato K.", area: "Sandton", days: 4, source: "Selling guide" },
  { name: "Ahmed S.", area: "Rivonia", days: 3, source: "Valuation form" },
  { name: "Jessica B.", area: "Morningside", days: 2, source: "Selling guide" },
];
const WAITING_TOTAL = 7;

const ADS = [
  { name: "What's my home worth? (video)", leads: 19, spend: 702, status: "Running" },
  { name: "Sold in 21 days (carousel)", leads: 11, spend: 488, status: "Running" },
  { name: "Free selling guide (image)", leads: 4, spend: 205, status: "Paused" },
];

const money = (n: number) => "R" + Math.round(n).toLocaleString("en-ZA");
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const cpl = (w: Week) => (w.leads ? w.spend / w.leads : 0);

/** "+6", "−R5": the change vs last week, coloured by whether it's good. */
function Delta({ now, before, money: isMoney = false, lowerIsBetter = false, suffix = "" }: { now: number; before: number; money?: boolean; lowerIsBetter?: boolean; suffix?: string }) {
  const d = Math.round(now - before);
  if (d === 0) return <span>Same as last week</span>;
  const good = lowerIsBetter ? d < 0 : d > 0;
  const abs = isMoney ? money(Math.abs(d)) : Math.abs(d) + suffix;
  return <span className={good ? "rep-up" : "rep-down"}>{d > 0 ? "▲ +" : "▼ −"}{abs}</span>;
}

function weekRange(offsetWeeks: number) {
  // Monday to Sunday of the last full week.
  const now = new Date();
  const day = (now.getDay() + 6) % 7;
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day - 1 - offsetWeeks * 7);
  const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 6);
  const f = (d: Date, y = false) => d.toLocaleDateString("en-ZA", { day: "numeric", month: "short", ...(y ? { year: "numeric" } : {}) });
  return { label: `${f(start)} – ${f(end, true)}`, start };
}

export default function WeeklyReportPage() {
  const { agentId = "" } = useParams();
  const [weeksBack, setWeeksBack] = useState(0);
  const { data: profiles = [] } = useQuery({ queryKey: ["agentProfiles"], queryFn: listAgentProfiles });
  const p = profiles.find((x) => x.agent_id === agentId);
  const agentName = p?.display_name || "Megan Demo";
  const company = p?.company || "";
  const area = p?.area || "";
  const initials = agentName.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const week = weekRange(weeksBack);
  const ref = `EK-WR-${week.start.getFullYear()}${String(week.start.getMonth() + 1).padStart(2, "0")}${String(week.start.getDate()).padStart(2, "0")}-${(agentId || "sample").replace(/-/g, "").slice(0, 4).toUpperCase()}`;

  useEffect(() => {
    document.title = `Weekly Report · ${agentName} · ${week.label}`;
  }, [agentName, week.label]);

  const t = THIS, l = LAST;
  const funnel = [
    { k: "New leads", v: t.leads },
    { k: "Called", v: t.called },
    { k: "Spoke to", v: t.spoke },
    { k: "Appointment", v: t.booked },
    { k: "Mandate", v: t.mandates },
  ];

  return (
    <div className="rep-viewer">
      <div className="rep-bar">
        <span className="rep-file">Weekly Report · {agentName} · <span style={{ color: "#ffcc80" }}>Sample numbers (layout preview)</span></span>
        <select value={weeksBack} onChange={(e) => setWeeksBack(Number(e.target.value))} aria-label="Week">
          {[0, 1, 2, 3].map((n) => <option key={n} value={n}>{weekRange(n).label}</option>)}
        </select>
        <button type="button" onClick={() => window.print()}>Save as PDF</button>
      </div>

      <article className="rep-page">
        <header className="rep-letterhead">
          <div>
            <img className="rep-logo" src={estateKitLogo} alt="EstateKit" />
            <h1>Weekly Performance Report</h1>
            <p>{week.label}</p>
          </div>
          <div className="rep-ref">
            Ref: <b>{ref}</b>
            <br />
            Period: <b>7 days</b>
            <br />
            Compared to: <b>previous week</b>
          </div>
        </header>

        <div className="rep-for">
          {p?.avatar_url ? <img className="rep-photo" src={p.avatar_url} alt="" /> : <div className="rep-photo">{initials}</div>}
          <div>
            <p className="rep-for-name">Prepared for {agentName}<span className="rep-sample">Sample data</span></p>
            <p className="rep-for-co">{[company, area].filter(Boolean).join(" · ") || "EstateKit client"}</p>
          </div>
        </div>

        <div className="rep-summary" role="status">
          <p className="rep-summary-title">{t.booked} appointments from {t.leads} leads this week.</p>
          <p>
            That's {t.booked - l.booked > 0 ? `${t.booked - l.booked} more than` : "the same as"} last week, at {money(cpl(t))} a lead. {WAITING_TOTAL} leads still
            haven't been called. Calling them is the quickest win for next week.
          </p>
        </div>

        <div className="rep-tiles">
          <div className="rep-tile">
            <div className="rep-tile-label">New leads</div>
            <div className="rep-tile-value">{t.leads}</div>
            <div className="rep-tile-delta"><Delta now={t.leads} before={l.leads} /></div>
          </div>
          <div className="rep-tile">
            <div className="rep-tile-label">Cost per lead</div>
            <div className="rep-tile-value">{money(cpl(t))}</div>
            <div className="rep-tile-delta"><Delta now={cpl(t)} before={cpl(l)} money lowerIsBetter /></div>
          </div>
          <div className="rep-tile">
            <div className="rep-tile-label">Appointments</div>
            <div className="rep-tile-value">{t.booked}</div>
            <div className="rep-tile-delta"><Delta now={t.booked} before={l.booked} /></div>
          </div>
          <div className="rep-tile">
            <div className="rep-tile-label">Mandates</div>
            <div className="rep-tile-value">{t.mandates}</div>
            <div className="rep-tile-delta"><Delta now={t.mandates} before={l.mandates} /></div>
          </div>
          <div className="rep-tile">
            <div className="rep-tile-label">Time to call</div>
            <div className="rep-tile-value">{t.medianMins}m</div>
            <div className="rep-tile-delta"><Delta now={t.medianMins} before={l.medianMins} lowerIsBetter suffix="m" /></div>
          </div>
        </div>

        <h2><span>1.</span> This week vs last week</h2>
        <table className="rep-table">
          <thead>
            <tr><th>Measure</th><th className="num">This week</th><th className="num">Last week</th><th className="num">Change</th></tr>
          </thead>
          <tbody>
            <tr><th scope="row">New leads</th><td className="num">{t.leads}</td><td className="num">{l.leads}</td><td className="num"><Delta now={t.leads} before={l.leads} /></td></tr>
            <tr><th scope="row">Ad spend</th><td className="num">{money(t.spend)}</td><td className="num">{money(l.spend)}</td><td className="num">{money(t.spend - l.spend)}</td></tr>
            <tr><th scope="row">Cost per lead</th><td className="num">{money(cpl(t))}</td><td className="num">{money(cpl(l))}</td><td className="num"><Delta now={cpl(t)} before={cpl(l)} money lowerIsBetter /></td></tr>
            <tr><th scope="row">Leads called</th><td className="num">{t.called} ({pct(t.called, t.leads)}%)</td><td className="num">{l.called} ({pct(l.called, l.leads)}%)</td><td className="num"><Delta now={pct(t.called, t.leads)} before={pct(l.called, l.leads)} suffix=" pts" /></td></tr>
            <tr><th scope="row">Called within 5 minutes</th><td className="num">{t.within5} ({pct(t.within5, t.leads)}%)</td><td className="num">{l.within5} ({pct(l.within5, l.leads)}%)</td><td className="num"><Delta now={pct(t.within5, t.leads)} before={pct(l.within5, l.leads)} suffix=" pts" /></td></tr>
            <tr><th scope="row">Appointments booked</th><td className="num">{t.booked}</td><td className="num">{l.booked}</td><td className="num"><Delta now={t.booked} before={l.booked} /></td></tr>
            <tr><th scope="row">Cost per appointment</th><td className="num">{money(t.spend / t.booked)}</td><td className="num">{money(l.spend / l.booked)}</td><td className="num"><Delta now={t.spend / t.booked} before={l.spend / l.booked} money lowerIsBetter /></td></tr>
            <tr><th scope="row">Mandates signed</th><td className="num">{t.mandates}</td><td className="num">{l.mandates}</td><td className="num"><Delta now={t.mandates} before={l.mandates} /></td></tr>
          </tbody>
        </table>

        <h2><span>2.</span> Where your leads got to</h2>
        <div className="rep-funnel">
          {funnel.map((f) => (
            <div className="rep-funnel-row" key={f.k}>
              <span>{f.k}</span>
              <div className="rep-funnel-track"><div className="rep-funnel-fill" style={{ width: `${Math.max(2, pct(f.v, t.leads))}%` }} /></div>
              <b>{f.v} <span className="pct">{pct(f.v, t.leads)}%</span></b>
            </div>
          ))}
        </div>
        <div className="rep-notice" role="note">
          <p className="rep-notice-title">Speed matters</p>
          <p>
            Half your leads were called within <b>{t.medianMins} minutes</b> (last week: {l.medianMins}). {t.within5} of {t.leads} were called inside 5 minutes.
            Leads called quickly are far more likely to pick up and book.
          </p>
        </div>

        <h2><span>3.</span> Leads still waiting for a call ({WAITING_TOTAL})</h2>
        <table className="rep-table">
          <thead>
            <tr><th>Name</th><th>Area</th><th>Came from</th><th className="num">Waiting</th></tr>
          </thead>
          <tbody>
            {WAITING.map((w) => (
              <tr key={w.name}><td>{w.name}</td><td>{w.area}</td><td>{w.source}</td><td className="num">{w.days} days</td></tr>
            ))}
          </tbody>
        </table>
        {WAITING_TOTAL > WAITING.length && <p className="rep-small">Plus {WAITING_TOTAL - WAITING.length} more. All of them are in your EstateKit leads list.</p>}

        <h2><span>4.</span> Your ads</h2>
        <table className="rep-table">
          <thead>
            <tr><th>Ad</th><th className="num">Leads</th><th className="num">Spend</th><th className="num">Cost per lead</th><th>Status</th></tr>
          </thead>
          <tbody>
            {ADS.map((a) => (
              <tr key={a.name}><td>{a.name}</td><td className="num">{a.leads}</td><td className="num">{money(a.spend)}</td><td className="num">{money(a.spend / a.leads)}</td><td>{a.status}</td></tr>
            ))}
          </tbody>
        </table>

        <h2><span>5.</span> Focus for next week</h2>
        <ol className="rep-actions">
          <li><b>Call the {WAITING_TOTAL} waiting leads first.</b> Oldest first: they cool off fast.</li>
          <li><b>Keep calling inside 5 minutes.</b> You did it for {pct(t.within5, t.leads)}% of leads. Aim for half.</li>
          <li><b>We're moving budget to "{ADS[0].name}".</b> It brings leads at {money(ADS[0].spend / ADS[0].leads)} each, your cheapest.</li>
        </ol>

        <footer className="rep-foot">
          <span>Prepared by EstateKit for {agentName} · leads.estatekit.co</span>
          <span>Questions? Reply on WhatsApp to your EstateKit contact.</span>
        </footer>
      </article>
    </div>
  );
}

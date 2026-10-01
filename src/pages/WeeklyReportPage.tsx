import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { listAgentProfiles } from "../api/_client";
import estateKitLogo from "../assets/blue logo full.png";
import "./report.css";

// Weekly Results: the report every client gets each week. Opened from a
// client's page (/report/<agent id>), saved as PDF.
//
// EVERGREEN: every word on the page lives in COPY below and is the same for
// every client, every week. Only the numbers (WeekData) change, so nobody
// writes anything by hand. The "focus" tips are picked by fixed rules from
// the numbers. Ad spend and cost per lead are deliberately never shown.
//
// UI ONLY FOR NOW: the agent's name and photo are real; SAMPLE_WEEK is made
// up. Backend pass, where each number comes from:
//   leads, booked, mandates, waiting, stage counts  get_agent_results(agent, 7) (+ prior 7 days)
//   contacted, spoke, median minutes to first call  lead_events: first 'call' / 'stage_changed' per lead
//   4-week trend                                    the same, for each of the last 4 weeks
//   waiting list, sources                           leads (stage = 'New Lead'), leads.source_page_id / fb form

interface WeekData {
  leads: number; contacted: number; spoke: number; booked: number; mandates: number;
  medianMins: number; within5: number;
  last: { leads: number; contacted: number; booked: number; mandates: number; medianMins: number };
  /** Oldest first, the last 4 weeks including this one. */
  trend: { leads: number[]; booked: number[] };
  stages: { newLead: number; noAnswer: number; contacted: number; booked: number; mandate: number };
  waiting: { name: string; area: string; days: number }[];
  sources: { name: string; leads: number }[];
}

const SAMPLE_WEEK: WeekData = {
  leads: 34, contacted: 27, spoke: 18, booked: 5, mandates: 1, medianMins: 7, within5: 12,
  last: { leads: 28, contacted: 19, booked: 3, mandates: 1, medianMins: 22 },
  trend: { leads: [22, 31, 28, 34], booked: [2, 4, 3, 5] },
  stages: { newLead: 7, noAnswer: 9, contacted: 21, booked: 6, mandate: 2 },
  waiting: [
    { name: "Thandi M.", area: "Bryanston", days: 6 },
    { name: "Pieter v. d. Merwe", area: "Fourways", days: 5 },
    { name: "Lerato K.", area: "Sandton", days: 4 },
    { name: "Ahmed S.", area: "Rivonia", days: 3 },
  ],
  sources: [
    { name: "Home valuation form", leads: 19 },
    { name: "Sold in 21 days", leads: 11 },
    { name: "Free selling guide", leads: 4 },
  ],
};

// Every sentence on the report. {placeholders} are filled from the numbers.
const COPY = {
  title: "Your week in leads",
  hello: "Hi {first},",
  summary: "{leads} new leads came in and {booked} booked an appointment.",
  kpi: { leads: "New leads", contacted: "Leads contacted", booked: "Appointments", mandates: "Mandates signed" },
  vsLast: "vs last week",
  trendCap: "Last 4 weeks",
  journey: "Where this week's leads got to",
  journeySteps: ["New leads", "Contacted", "Spoke to", "Appointment", "Mandate"],
  speed: "Speed to lead",
  speedLine: "Half of your leads were called within {mins} minutes. {within5} of {leads} were called inside 5 minutes.",
  speedTarget: "Aim: under 5 minutes. Leads called quickly are far more likely to answer.",
  pipeline: "Your pipeline right now",
  stages: { newLead: "Not called yet", noAnswer: "No answer", contacted: "Contacted", booked: "Appointments", mandate: "Mandates" },
  waiting: "Waiting for a first call",
  waitingNone: "Every lead has had a call. Well done.",
  waitingMore: "+ {n} more in your EstateKit leads list",
  sources: "Where your leads came from",
  focus: "Your focus for next week",
  footLeft: "Prepared by EstateKit for {name}",
  footRight: "Your leads, live: leads.estatekit.co",
};

/** Fixed rules, checked in order; the first three that apply are shown. */
const FOCUS_RULES: { when: (d: WeekData) => boolean; title: string; body: string }[] = [
  { when: (d) => d.stages.newLead > 0, title: "Call your {waiting} waiting leads first.", body: "Start with the oldest. A lead cools off fast after the first day." },
  { when: (d) => d.medianMins > 5, title: "Call new leads within 5 minutes.", body: "Your WhatsApp alert has a one-tap call button. Use it the moment it arrives." },
  { when: (d) => d.stages.noAnswer > 0, title: "Try your {noAnswer} 'No answer' leads again.", body: "Call at a different time of day than last time. Early evening works well." },
  { when: (d) => d.booked < d.spoke / 3, title: "Ask for the appointment on every call.", body: "Offer two times: \"Would Tuesday at 10 or Wednesday at 4 suit you better?\"" },
  { when: () => true, title: "Keep every lead's stage up to date.", body: "It keeps your follow-up reminders right, and this report accurate." },
];

const fillIn = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? String(v[k]) : m));
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

function Delta({ now, before, lowerIsBetter = false, suffix = "" }: { now: number; before: number; lowerIsBetter?: boolean; suffix?: string }) {
  const d = Math.round(now - before);
  const good = lowerIsBetter ? d < 0 : d > 0;
  return (
    <span className="wr-delta-row">
      {d === 0
        ? <span className="wr-delta flat">Same</span>
        : <span className={`wr-delta ${good ? "up" : "down"}`}>{d > 0 ? "▲" : "▼"} {Math.abs(d)}{suffix}</span>}
      <span className="wr-delta-cap">{COPY.vsLast}</span>
    </span>
  );
}

function Spark({ values, label }: { values: number[]; label: string }) {
  const max = Math.max(1, ...values);
  return (
    <div>
      <div className="wr-spark" role="img" aria-label={`${label}, last 4 weeks: ${values.join(", ")}`}>
        {values.map((v, i) => <i key={i} style={{ height: `${Math.max(10, (v / max) * 100)}%` }} title={`${v}`} />)}
      </div>
      <div className="wr-spark-cap">{COPY.trendCap}</div>
    </div>
  );
}

function weekRange(offsetWeeks: number) {
  // Monday to Sunday of the last full week.
  const now = new Date();
  const day = (now.getDay() + 6) % 7;
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day - 1 - offsetWeeks * 7);
  const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 6);
  const f = (d: Date, y = false) => d.toLocaleDateString("en-ZA", { day: "numeric", month: "short", ...(y ? { year: "numeric" } : {}) });
  return `${f(start)} – ${f(end, true)}`;
}

export default function WeeklyReportPage() {
  const { agentId = "" } = useParams();
  const [weeksBack, setWeeksBack] = useState(0);
  const { data: profiles = [] } = useQuery({ queryKey: ["agentProfiles"], queryFn: listAgentProfiles });
  const p = profiles.find((x) => x.agent_id === agentId);
  const name = p?.display_name || "Megan Demo";
  const first = name.split(/\s+/)[0];
  const initials = name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const period = weekRange(weeksBack);
  const d = SAMPLE_WEEK;
  const vars = { first, name, leads: d.leads, booked: d.booked, mins: d.medianMins, within5: d.within5, waiting: d.stages.newLead, noAnswer: d.stages.noAnswer };
  const focus = FOCUS_RULES.filter((r) => r.when(d)).slice(0, 3);
  const journey = [d.leads, d.contacted, d.spoke, d.booked, d.mandates];
  const maxSource = Math.max(1, ...d.sources.map((s) => s.leads));
  const extraWaiting = d.stages.newLead - d.waiting.length;

  useEffect(() => {
    document.title = `Weekly results · ${name} · ${period}`;
  }, [name, period]);

  return (
    <div className="wr-viewer">
      <div className="wr-bar">
        <div className="wr-bar-title">Weekly results · {name} <span>· sample numbers</span></div>
        <select value={weeksBack} onChange={(e) => setWeeksBack(Number(e.target.value))} aria-label="Week">
          {[0, 1, 2, 3].map((n) => <option key={n} value={n}>{weekRange(n)}</option>)}
        </select>
        <button type="button" onClick={() => window.print()}>Save as PDF</button>
      </div>

      <article className="wr-page">
        <header className="wr-head">
          <img className="wr-logo" src={estateKitLogo} alt="EstateKit" />
          <div className="wr-period">
            <small>Weekly results</small>
            <b>{period}</b>
          </div>
        </header>

        <div className="wr-hello">
          {p?.avatar_url ? <img className="wr-avatar" src={p.avatar_url} alt="" /> : <div className="wr-avatar">{initials}</div>}
          <div>
            <h1>{COPY.title}<span className="wr-sample">Sample</span></h1>
            <p>{fillIn(COPY.hello, vars)} {fillIn(COPY.summary, vars)}</p>
          </div>
        </div>

        <div className="wr-body">
          <section className="wr-section" aria-label="This week">
            <div className="wr-kpis">
              <div className="wr-kpi">
                <span className="wr-kpi-label">{COPY.kpi.leads}</span>
                <span className="wr-kpi-value">{d.leads}</span>
                <Delta now={d.leads} before={d.last.leads} />
                <Spark values={d.trend.leads} label={COPY.kpi.leads} />
              </div>
              <div className="wr-kpi">
                <span className="wr-kpi-label">{COPY.kpi.contacted}</span>
                <span className="wr-kpi-value">{pct(d.contacted, d.leads)}<small>%</small></span>
                <Delta now={pct(d.contacted, d.leads)} before={pct(d.last.contacted, d.last.leads)} suffix=" pts" />
                <span className="wr-spark-cap">{d.contacted} of {d.leads} leads</span>
              </div>
              <div className="wr-kpi">
                <span className="wr-kpi-label">{COPY.kpi.booked}</span>
                <span className="wr-kpi-value">{d.booked}</span>
                <Delta now={d.booked} before={d.last.booked} />
                <Spark values={d.trend.booked} label={COPY.kpi.booked} />
              </div>
              <div className="wr-kpi">
                <span className="wr-kpi-label">{COPY.kpi.mandates}</span>
                <span className="wr-kpi-value">{d.mandates}</span>
                <Delta now={d.mandates} before={d.last.mandates} />
              </div>
            </div>
          </section>

          <div className="wr-two">
            <section className="wr-card wr-section">
              <h2>{COPY.journey}</h2>
              <div className="wr-funnel">
                {COPY.journeySteps.map((label, i) => (
                  <div className="wr-step" key={label}>
                    <span>{label}</span>
                    <div className="wr-step-track"><div className="wr-step-fill" style={{ width: `${Math.max(2, pct(journey[i], d.leads))}%` }} /></div>
                    <b>{journey[i]}<span>{pct(journey[i], d.leads)}%</span></b>
                  </div>
                ))}
              </div>
            </section>
            <section className="wr-card wr-section">
              <h2>{COPY.speed}</h2>
              <div className="wr-speed-num">{d.medianMins}<small>min</small></div>
              <Delta now={d.medianMins} before={d.last.medianMins} lowerIsBetter suffix=" min" />
              <div className="wr-gauge" aria-hidden="true"><i style={{ left: `${Math.min(100, (d.medianMins / 20) * 100)}%` }} /></div>
              <div className="wr-gauge-scale" aria-hidden="true"><span style={{ left: 0 }}>0</span><span style={{ left: "25%" }}>5</span><span style={{ left: "60%" }}>12</span><span style={{ right: 0 }}>20+ min</span></div>
              <p className="wr-muted">{fillIn(COPY.speedLine, vars)} {COPY.speedTarget}</p>
            </section>
          </div>

          <section className="wr-section">
            <h2>{COPY.pipeline}</h2>
            <div className="wr-stages">
              {(Object.keys(COPY.stages) as (keyof typeof COPY.stages)[]).map((k) => (
                <div key={k} className={`wr-stage${k === "newLead" && d.stages.newLead ? " hot" : ""}`}>
                  <b>{d.stages[k]}</b>
                  <span>{COPY.stages[k]}</span>
                </div>
              ))}
            </div>
          </section>

          <div className="wr-two">
            <section className="wr-card wr-section">
              <h2>{COPY.waiting}</h2>
              {d.waiting.length ? (
                <ul className="wr-list">
                  {d.waiting.map((w) => (
                    <li key={w.name}>
                      <span className="grow">{w.name}</span>
                      <span className="meta">{w.area}</span>
                      <span className="wr-pill">{w.days} days</span>
                    </li>
                  ))}
                  {extraWaiting > 0 && <li className="meta">{fillIn(COPY.waitingMore, { n: extraWaiting })}</li>}
                </ul>
              ) : <p className="wr-muted">{COPY.waitingNone}</p>}
            </section>
            <section className="wr-card wr-section">
              <h2>{COPY.sources}</h2>
              <ul className="wr-list">
                {d.sources.map((s) => (
                  <li key={s.name}>
                    <span className="grow">{s.name}</span>
                    <span className="wr-source-bar"><i style={{ width: `${(s.leads / maxSource) * 100}%` }} /></span>
                    <b style={{ minWidth: 22, textAlign: "right" }}>{s.leads}</b>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <section className="wr-section">
            <h2>{COPY.focus}</h2>
            <div className="wr-focus">
              {focus.map((f, i) => (
                <div className="wr-focus-item" key={f.title}>
                  <span className="wr-focus-n">{i + 1}</span>
                  <div><b>{fillIn(f.title, vars)}</b>{f.body}</div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <footer className="wr-foot">
          <span>{fillIn(COPY.footLeft, vars)}</span>
          <span>{COPY.footRight}</span>
        </footer>
      </article>
    </div>
  );
}

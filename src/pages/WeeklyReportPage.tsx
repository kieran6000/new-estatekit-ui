import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { listAgentProfiles } from "../api/_client";
import estateKitLogo from "../assets/blue logo full.png";
import "./report.css";

// The weekly report every client gets. Opened from a client's page
// (/report/<agent id>) and saved as PDF. One page, dashboard look.
//
// Rules for this page (agreed Oct 2026):
// - Plain words a busy agent reads in 20 seconds. No advice, no tips.
// - Only the numbers that decide whether they make money: leads, calls,
//   appointments, mandates, and how fast they call.
// - Never show ad spend or cost per lead.
// - Always say the leads come from the campaign EstateKit runs for them.
// - Evergreen: every word lives in this file and is the same every week;
//   only the numbers change.
//
// UI ONLY FOR NOW: name and photo are real, SAMPLE is made up. Where each
// number will come from:
//   leads, booked, mandates, notCalled, noAnswer  get_agent_results(agent, 7) (+ the 7 days before)
//   called, typicalMins                           lead_events: first 'call' / 'stage_changed' per lead
//   weeks                                         the same, for each of the last 4 weeks
//   campaign.total / since / adsLive              leads since the account's first lead; fb-active-ads

interface Week { leads: number; called: number; booked: number; mandates: number }

interface ReportData {
  thisWeek: Week;
  lastWeek: Week;
  /** Median minutes from a lead arriving to the agent's first call. */
  typicalMins: number;
  lastTypicalMins: number;
  notCalled: number;
  noAnswer: number;
  campaign: { total: number; since: string; adsLive: number };
  /** Oldest first, this week last. */
  weeks: (Week & { label: string })[];
}

const SAMPLE: ReportData = {
  thisWeek: { leads: 34, called: 27, booked: 5, mandates: 1 },
  lastWeek: { leads: 28, called: 19, booked: 3, mandates: 1 },
  typicalMins: 7,
  lastTypicalMins: 22,
  notCalled: 7,
  noAnswer: 9,
  campaign: { total: 412, since: "March 2026", adsLive: 3 },
  weeks: [
    { label: "31 Aug", leads: 22, called: 15, booked: 2, mandates: 0 },
    { label: "7 Sep", leads: 31, called: 22, booked: 4, mandates: 1 },
    { label: "14 Sep", leads: 28, called: 19, booked: 3, mandates: 1 },
    { label: "21 Sep", leads: 34, called: 27, booked: 5, mandates: 1 },
  ],
};

/** "▲ Last week: 28": short enough never to wrap, and the arrow's colour says good or bad. */
function Change({ now, before, lessIsBetter = false }: { now: number; before: number; lessIsBetter?: boolean }) {
  const d = now - before;
  const cls = d === 0 ? "same" : (lessIsBetter ? d < 0 : d > 0) ? "up" : "down";
  return <span className={`wr-change ${cls}`}>{d > 0 ? "▲ " : d < 0 ? "▼ " : ""}Last week: {before}</span>;
}

function speedVerdict(mins: number): { cls: "great" | "ok" | "slow"; word: string } {
  if (mins <= 5) return { cls: "great", word: "Great" };
  if (mins <= 30) return { cls: "ok", word: "OK" };
  return { cls: "slow", word: "Too slow" };
}

/** Marker position on the 3-zone scale: 0–5 min, 5–30 min, 30–120+ min, a third each. */
function speedPos(mins: number): number {
  if (mins <= 5) return (mins / 5) * 33.3;
  if (mins <= 30) return 33.3 + ((mins - 5) / 25) * 33.3;
  return Math.min(98, 66.6 + ((mins - 30) / 90) * 33.3);
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
  const initials = name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const period = weekRange(weeksBack);
  const d = SAMPLE;
  const t = d.thisWeek, l = d.lastWeek;
  const v = speedVerdict(d.typicalMins);

  useEffect(() => {
    document.title = `Weekly report · ${name} · ${period}`;
  }, [name, period]);

  return (
    <div className="wr-viewer">
      <div className="wr-bar">
        <div className="wr-bar-title">Weekly report · {name} <span>· sample numbers</span></div>
        <select value={weeksBack} onChange={(e) => setWeeksBack(Number(e.target.value))} aria-label="Week">
          {[0, 1, 2, 3].map((n) => <option key={n} value={n}>{weekRange(n)}</option>)}
        </select>
        <button type="button" onClick={() => window.print()}>Save as PDF</button>
      </div>

      <article className="wr-page">
        <header className="wr-head">
          {p?.avatar_url ? <img className="wr-avatar" src={p.avatar_url} alt="" /> : <div className="wr-avatar">{initials}</div>}
          <div className="wr-head-text">
            <h1>Weekly report: {name}<span className="wr-sample">SAMPLE</span></h1>
            <p>{period} · See every lead at leads.estatekit.co</p>
          </div>
          <img className="wr-logo" src={estateKitLogo} alt="EstateKit" />
        </header>

        <div className="wr-body">
          <section>
            <h2 className="wr-label">This week</h2>
            <div className="wr-tiles">
              <div className="wr-tile">
                <span className="wr-tile-name">New leads</span>
                <span className="wr-tile-num">{t.leads}</span>
                <Change now={t.leads} before={l.leads} />
              </div>
              <div className="wr-tile">
                <span className="wr-tile-name">Leads called</span>
                <span className="wr-tile-num">{t.called}</span>
                <span className="wr-tile-sub">{t.called} of {t.leads} leads</span>
              </div>
              <div className="wr-tile">
                <span className="wr-tile-name">Appointments</span>
                <span className="wr-tile-num">{t.booked}</span>
                <Change now={t.booked} before={l.booked} />
              </div>
              <div className="wr-tile">
                <span className="wr-tile-name">Mandates</span>
                <span className="wr-tile-num">{t.mandates}</span>
                <Change now={t.mandates} before={l.mandates} />
              </div>
            </div>
          </section>

          <div className="wr-two">
            <section className="wr-box">
              <h2 className="wr-label">How fast you call new leads</h2>
              <div className="wr-speed">
                <b>{d.typicalMins} min</b>
                <span className={`wr-verdict ${v.cls}`}>{v.word}</span>
              </div>
              <div className="wr-scale" aria-hidden="true">
                <i style={{ left: `${speedPos(d.typicalMins)}%` }} />
                <div>Great<br />under 5 min</div>
                <div>OK<br />5 to 30 min</div>
                <div>Too slow<br />over 30 min</div>
              </div>
              <p className="wr-note">
                Last week: {d.lastTypicalMins} min.
              </p>
            </section>

            <section className="wr-box">
              <h2 className="wr-label">Waiting for you right now</h2>
              <div className="wr-todo">
                <div className={`wr-todo-row${d.notCalled ? " hot" : ""}`}>
                  <b>{d.notCalled}</b>
                  <span>Not called yet<small>Call these first</small></span>
                </div>
                <div className="wr-todo-row">
                  <b>{d.noAnswer}</b>
                  <span>Didn't answer<small>Try them again</small></span>
                </div>
              </div>
            </section>
          </div>

          <section className="wr-ek">
            <div className="wr-ek-main">
              <b>Leads from your EstateKit campaign</b>
              <span>We run your Facebook and Instagram ads and send every lead to you.</span>
              <div className="wr-live" style={{ marginTop: 6 }}>{d.campaign.adsLive} ads running now</div>
            </div>
            <div className="wr-ek-stat"><b>{t.leads}</b><span>leads this week</span></div>
            <div className="wr-ek-stat"><b>{d.campaign.total}</b><span>leads since {d.campaign.since}</span></div>
          </section>

          <section>
            <h2 className="wr-label">Last 4 weeks</h2>
            <div className="wr-table-wrap">
              <table className="wr-table">
                <thead>
                  <tr>
                    <th scope="col">Week starting</th>
                    {d.weeks.map((w, i) => <th key={w.label} scope="col" className={i === d.weeks.length - 1 ? "now" : ""}>{w.label}{i === d.weeks.length - 1 ? " (this week)" : ""}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {([["New leads", "leads"], ["Leads called", "called"], ["Appointments", "booked"], ["Mandates", "mandates"]] as const).map(([label, k]) => (
                    <tr key={k}>
                      <th scope="row" style={{ fontWeight: 400 }}>{label}</th>
                      {d.weeks.map((w, i) => <td key={w.label} className={i === d.weeks.length - 1 ? "now" : ""}>{w[k]}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* Agents push back when a number looks wrong ("I DID call them").
            Say exactly what each number counts, and the one habit that makes
            a call count, so the fix is theirs and obvious. Keep this in step
            with get_agent_results and lead_events. */}
        <section className="wr-how">
          <h2 className="wr-label">How these numbers are counted</h2>
          <dl className="wr-how-list">
            <dt>New leads</dt><dd>Leads that arrived in your EstateKit leads list.</dd>
            <dt>Leads called</dt><dd>You tapped <b>Call</b> in EstateKit, or changed the lead's stage.</dd>
            <dt>Appointments, Mandates</dt><dd>You moved the lead to <b>Booked</b> or <b>Mandate Signed</b>.</dd>
            <dt>How fast you call</dt><dd>From a new lead arriving to your first Call tap or stage change.</dd>
          </dl>
          <p className="wr-how-tip"><b>Called from your phone's contacts?</b> EstateKit can't see that. Tap Call in EstateKit, or update the lead's stage after the call.</p>
        </section>

      </article>
    </div>
  );
}

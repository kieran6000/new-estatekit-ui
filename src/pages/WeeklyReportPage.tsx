import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { listAgentProfiles } from "../api/_client";
import { getWeeklyReport, weekLabel, type WeeklyReport } from "../api/weeklyReport";
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
// The numbers come from src/api/weeklyReport.ts (what the agent did in
// EstateKit). Keep "How these numbers are counted" below in step with it.

/** "▲ Last week: 28": short enough never to wrap, and the arrow's colour says good or bad. */
function Change({ now, before, lessIsBetter = false }: { now: number; before: number; lessIsBetter?: boolean }) {
  const d = now - before;
  const cls = d === 0 ? "same" : (lessIsBetter ? d < 0 : d > 0) ? "up" : "down";
  return <span className={`wr-change ${cls}`}>{d > 0 ? "▲ " : d < 0 ? "▼ " : ""}Last week: {before}</span>;
}

/** 7 → "7 min", 150 → "2.5 hours", 1610 → "1.1 days". */
function duration(mins: number): string {
  if (mins < 60) return `${mins} min`;
  if (mins < 1440) { const h = Math.round(mins / 6) / 10; return `${h} hour${h === 1 ? "" : "s"}`; }
  const d = Math.round(mins / 144) / 10;
  return `${d} day${d === 1 ? "" : "s"}`;
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

export default function WeeklyReportPage() {
  const { agentId = "" } = useParams();
  const [params] = useSearchParams();
  // ?w=1 opens a past week (the Weekly reports page's preview links use it).
  const [weeksBack, setWeeksBack] = useState(() => Math.min(7, Math.max(0, Number(params.get("w")) || 0)));
  const { data: profiles = [] } = useQuery({ queryKey: ["agentProfiles"], queryFn: listAgentProfiles });
  const p = profiles.find((x) => x.agent_id === agentId);
  const name = p?.display_name || "";
  const period = weekLabel(weeksBack);
  const { data: d, isLoading, isError } = useQuery({
    queryKey: ["weeklyReport", agentId, weeksBack],
    queryFn: () => getWeeklyReport(agentId, weeksBack),
    enabled: !!agentId,
  });

  useEffect(() => {
    document.title = `Weekly report · ${name} · ${period}`;
  }, [name, period]);

  if (!d) {
    return (
      <div className="wr-viewer">
        <div className="wr-page" style={{ padding: 40, textAlign: "center" }}>
          {isLoading ? "Loading the report…" : isError ? "Couldn't load this report. Refresh to try again." : "Pick a client from Accounts to see their report."}
        </div>
      </div>
    );
  }
  return (
    <div className="wr-viewer">
      <div className="wr-bar">
        <div className="wr-bar-title">Weekly report · {name}</div>
        <select value={weeksBack} onChange={(e) => setWeeksBack(Number(e.target.value))} aria-label="Week">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{weekLabel(n)}</option>)}
        </select>
        <button type="button" onClick={() => window.print()}>Save as PDF</button>
      </div>
      <ReportArticle name={name} avatarUrl={p?.avatar_url ?? null} period={period} d={d} />
    </div>
  );
}

/** The one-page report itself. Used by the CSM's preview above and by the
 *  agent's link (/r/<token>, SharedReportPage), so both always match. */
export function ReportArticle({ name, avatarUrl, period, d }: { name: string; avatarUrl: string | null; period: string; d: WeeklyReport }) {
  const initials = name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const t = d.thisWeek, l = d.lastWeek;
  const v = d.typicalMins === null ? null : speedVerdict(d.typicalMins);

  return (
      <article className="wr-page">
        <header className="wr-head">
          {avatarUrl ? <img className="wr-avatar" src={avatarUrl} alt="" /> : <div className="wr-avatar">{initials}</div>}
          <div className="wr-head-text">
            <h1>Weekly report: {name}</h1>
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
                <span className="wr-tile-sub">{t.called} of {t.leads} new leads</span>
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
              {d.typicalMins !== null && v ? (
                <>
                  <div className="wr-speed">
                    <b>{duration(d.typicalMins)}</b>
                    <span className={`wr-verdict ${v.cls}`}>{v.word}</span>
                  </div>
                  <div className="wr-scale" aria-hidden="true">
                    <i style={{ left: `${speedPos(d.typicalMins)}%` }} />
                    <div>Great<br />under 5 min</div>
                    <div>OK<br />5 to 30 min</div>
                    <div>Too slow<br />over 30 min</div>
                  </div>
                </>
              ) : (
                <div className="wr-speed"><b>—</b><span>No calls logged in EstateKit this week</span></div>
              )}
              <p className="wr-note">
                {d.lastTypicalMins !== null ? `Last week: ${duration(d.lastTypicalMins)}.` : "Last week: no calls logged."}
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
            </div>
            <div className="wr-ek-stat"><b>{d.campaign.thisWeek}</b><span>leads this week</span></div>
            <div className="wr-ek-stat"><b>{d.campaign.total}</b><span>{d.campaign.since ? `leads since ${d.campaign.since}` : "leads so far"}</span></div>
          </section>

          <section>
            <h2 className="wr-label">Last 4 weeks</h2>
            <div className="wr-table-wrap">
              <table className="wr-table">
                <thead>
                  <tr>
                    <th scope="col">Week starting</th>
                    {d.weeks.map((w, i) => <th key={w.label} scope="col" className={i === d.weeks.length - 1 ? "now" : ""}>{w.label}{i === d.weeks.length - 1 ? <span className="wr-hide-sm"> (this report)</span> : ""}</th>)}
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
            with src/api/weeklyReport.ts. */}
        <section className="wr-how">
          <h2 className="wr-label">How these numbers are counted</h2>
          <dl className="wr-how-list">
            <dt>New leads</dt><dd>Leads that arrived in your EstateKit leads list.</dd>
            <dt>Leads called</dt><dd>New leads where you tapped <b>Call</b> in EstateKit, or changed their stage.</dd>
            <dt>Appointments, Mandates</dt><dd>Leads you moved to <b>Booked</b> or <b>Mandate Signed</b> this week.</dd>
            <dt>How fast you call</dt><dd>Typical time from a new lead arriving to your first Call tap or stage change.</dd>
          </dl>
          <p className="wr-how-tip"><b>Called from your phone's contacts?</b> EstateKit can't see that. Tap Call in EstateKit, or update the lead's stage after the call.</p>
        </section>

      </article>
  );
}

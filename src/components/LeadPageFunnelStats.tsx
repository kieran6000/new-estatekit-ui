import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Box, MenuItem, Select, Skeleton, Table, TableBody, TableCell, TableHead, TableRow, Tooltip, Typography } from "@mui/material";
import { tokens } from "../theme";
import { getLeadPageEvents, type LeadPageEvent } from "../api/leadPages";

// How one website form is doing (Forms → Tracking, staff only). Counts are
// unique visitors (each step is stored once per visitor); people signed in
// to EstateKit (agents, staff) aren't counted.
//  1. Four numbers: visitors, leads, % who became leads, turned away.
//  2. The funnel: where people stop, as bars with the drop at each step.
//  3. Visitors and leads per day (one scale: both are people).
//  4. Where visitors came from, as a table.

type Period = "7" | "30" | "90";
const DAY = 86_400_000;

const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);
/** The day in South African time, e.g. "2026-10-17". */
const sastDay = (iso: string) => new Date(new Date(iso).getTime() + 2 * 3600_000).toISOString().slice(0, 10);
const dayLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" }).replace(/,/g, "");

/** "fb" → Facebook, "l.instagram.com" → Instagram; anything else as it came. */
function sourceName(raw: string | null): string {
  const v = (raw || "").trim();
  if (!v) return "Direct";
  if (/^(fb|facebook)$|facebook\.com$/i.test(v)) return "Facebook";
  if (/^(ig|instagram)$|instagram\.com$/i.test(v)) return "Instagram";
  if (/^google(\.\w+){0,2}$/i.test(v)) return "Google";
  return v;
}

function summarise(events: LeadPageEvent[], days: number) {
  const count = (t: LeadPageEvent["event_type"]) => events.filter((e) => e.event_type === t).length;
  const views = count("view"), starts = count("start"), contacts = count("contact"), submits = count("submit"), disqualified = count("disqualified");

  // Every day in the period, so quiet days show as gaps, not missing.
  const today = sastDay(new Date().toISOString());
  const byDay = new Map<string, { views: number; leads: number }>();
  for (let i = days - 1; i >= 0; i--) byDay.set(sastDay(new Date(new Date(`${today}T12:00:00Z`).getTime() - i * DAY).toISOString()), { views: 0, leads: 0 });
  for (const e of events) {
    const d = byDay.get(sastDay(e.created_at));
    if (!d) continue;
    if (e.event_type === "view") d.views++;
    if (e.event_type === "submit") d.leads++;
  }

  // A visitor's source is the one on their visit.
  const bySource = new Map<string, { views: number; leads: number }>();
  for (const e of events) {
    if (e.event_type !== "view" && e.event_type !== "submit") continue;
    const k = sourceName(e.source);
    const s = bySource.get(k) ?? { views: 0, leads: 0 };
    if (e.event_type === "view") s.views++; else s.leads++;
    bySource.set(k, s);
  }
  const sources = [...bySource.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.views - a.views || b.leads - a.leads);

  return { views, starts, contacts, submits, disqualified, days: [...byDay.entries()].map(([day, v]) => ({ day, ...v })), sources };
}

export default function LeadPageFunnelStats({ pageId }: { pageId: string }) {
  const [period, setPeriod] = useState<Period>("30");
  const days = Number(period);
  const since = new Date(Date.now() - days * DAY).toISOString();
  const { data: events, isLoading, isError } = useQuery({
    queryKey: ["leadPageEvents", pageId, period],
    queryFn: () => getLeadPageEvents(pageId, since),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
  const s = useMemo(() => (events ? summarise(events, days) : null), [events, days]);

  return (
    <Box sx={{ border: `1px solid ${tokens.divider}`, borderRadius: "8px", bgcolor: "background.paper", p: 2, display: "flex", flexDirection: "column", gap: 3 }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
        <Typography sx={{ fontSize: 12, fontWeight: 500, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.06em" }}>How this form is doing</Typography>
        <Select size="small" value={period} onChange={(e) => setPeriod(e.target.value as Period)} sx={{ fontSize: 13.5 }}>
          <MenuItem value="7">Last 7 days</MenuItem>
          <MenuItem value="30">Last 30 days</MenuItem>
          <MenuItem value="90">Last 90 days</MenuItem>
        </Select>
      </Box>

      {isError ? (
        <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Couldn't load the numbers. Try again in a minute.</Typography>
      ) : isLoading || !s ? (
        <Skeleton variant="rounded" height={320} sx={{ borderRadius: "8px" }} />
      ) : s.views === 0 ? (
        <Typography sx={{ fontSize: 14, color: "text.secondary" }}>No visitors in this time yet. Numbers show here once people open the form.</Typography>
      ) : (
        <>
          <Tiles s={s} />
          <Funnel s={s} />
          <Daily days={s.days} />
          <Sources sources={s.sources} />
        </>
      )}
    </Box>
  );
}

type Summary = ReturnType<typeof summarise>;

function Heading({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <Box sx={{ mb: 1.25 }}>
      <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{children}</Typography>
      {sub && <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>{sub}</Typography>}
    </Box>
  );
}

function Tiles({ s }: { s: Summary }) {
  const tiles = [
    { label: "Visitors", value: s.views.toLocaleString("en-ZA") },
    { label: "Leads", value: s.submits.toLocaleString("en-ZA") },
    { label: "Visitors who became leads", value: `${pct(s.submits, s.views)}%` },
    { label: "Turned away by an answer", value: s.disqualified.toLocaleString("en-ZA") },
  ];
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(4, 1fr)" }, gap: 1.5 }}>
      {tiles.map((t) => (
        <Box key={t.label} sx={{ border: `1px solid ${tokens.divider2}`, borderRadius: "8px", p: "10px 12px" }}>
          <Typography sx={{ fontSize: 22, fontWeight: 600, lineHeight: 1.2 }}>{t.value}</Typography>
          <Typography sx={{ fontSize: 12.5, color: "text.secondary", mt: 0.25 }}>{t.label}</Typography>
        </Box>
      ))}
    </Box>
  );
}

/** One bar per step, all against visitors; the drop from the step before
 *  is written beside it, and the biggest drop is called out. */
function Funnel({ s }: { s: Summary }) {
  // A step fewer people reached than the next one wasn't recorded on this
  // form (e.g. it asks for contact details another way): left out, not 0.
  const steps = [
    { label: "Opened the form", n: s.views },
    { label: "Started answering", n: s.starts },
    { label: "Got to their contact details", n: s.contacts },
    { label: "Became a lead", n: s.submits },
  ].filter((st, i, all) => i === all.length - 1 || st.n >= all[i + 1].n);
  const drops = steps.map((st, i) => (i ? Math.max(0, steps[i - 1].n - st.n) : 0));
  const worst = drops.indexOf(Math.max(...drops));
  return (
    <Box>
      <Heading sub="Each bar is the share of visitors who got that far.">Where people stop</Heading>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
        {steps.map((st, i) => {
          const w = pct(st.n, s.views);
          return (
            <Box key={st.label}>
              <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, fontSize: 13.5, mb: 0.5 }}>
                <Box component="span">{st.label}</Box>
                <Box component="span" sx={{ fontVariantNumeric: "tabular-nums", color: "text.secondary", whiteSpace: "nowrap" }}>
                  <b style={{ color: tokens.ink }}>{st.n.toLocaleString("en-ZA")}</b> · {w}%
                </Box>
              </Box>
              <Box sx={{ height: 14, borderRadius: "0 4px 4px 0", bgcolor: tokens.surface2, overflow: "hidden" }}>
                <Box sx={{ height: "100%", width: `${Math.max(w, st.n ? 1 : 0)}%`, bgcolor: tokens.primary, borderRadius: "0 4px 4px 0" }} />
              </Box>
              {i > 0 && drops[i] > 0 && (
                <Typography sx={{ fontSize: 12, color: i === worst ? tokens.ink : "text.secondary", fontWeight: i === worst ? 600 : 400, mt: 0.25 }}>
                  {drops[i].toLocaleString("en-ZA")} stopped here{i === worst ? " · the biggest drop" : ""}
                </Typography>
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

/** Columns per day: visitors (light), and inside each, the ones who became
 *  leads (full colour). Leads are a part of visitors, so one scale. */
function Daily({ days }: { days: { day: string; views: number; leads: number }[] }) {
  const max = Math.max(1, ...days.map((d) => d.views));
  const tick = niceMax(max);
  const H = 140;
  return (
    <Box>
      <Heading>Visitors and leads per day</Heading>
      <Box sx={{ display: "flex", gap: 2, fontSize: 12.5, color: "text.secondary", mb: 1 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}><Box sx={{ width: 10, height: 10, borderRadius: "2px", bgcolor: LIGHT }} />Visitors</Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}><Box sx={{ width: 10, height: 10, borderRadius: "2px", bgcolor: tokens.primary }} />Became leads</Box>
      </Box>
      <Box sx={{ display: "flex", gap: 1 }}>
        {/* Axis: 0, half, top. */}
        <Box sx={{ position: "relative", width: 28, height: H, flex: "none", fontSize: 11, color: "text.secondary", textAlign: "right" }}>
          {[tick, tick / 2, 0].map((v, i) => (
            <Box key={i} sx={{ position: "absolute", right: 0, top: i * (H / 2) - 7 }}>{Math.round(v)}</Box>
          ))}
        </Box>
        <Box sx={{ position: "relative", flex: 1, minWidth: 0, height: H, borderBottom: `1px solid ${tokens.divider}` }}>
          {[0, 0.5].map((f) => <Box key={f} sx={{ position: "absolute", left: 0, right: 0, top: f * H, borderTop: `1px solid ${tokens.divider2}` }} />)}
          <Box sx={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", gap: "2px" }}>
            {days.map((d) => (
              <Tooltip key={d.day} arrow title={<>{dayLabel(d.day)}<br />{d.views} visitor{d.views === 1 ? "" : "s"} · {d.leads} lead{d.leads === 1 ? "" : "s"}</>}>
                {/* The whole slot is the hover target, not just the column. */}
                <Box aria-label={`${dayLabel(d.day)}: ${d.views} visitors, ${d.leads} leads`} sx={{ flex: 1, height: "100%", display: "flex", alignItems: "flex-end", justifyContent: "center", cursor: "default", "&:hover > div": { filter: "brightness(0.92)" } }}>
                  <Box sx={{ position: "relative", width: "100%", maxWidth: 24, height: `${(d.views / tick) * 100}%`, bgcolor: LIGHT, borderRadius: "4px 4px 0 0" }}>
                    {d.leads > 0 && <Box sx={{ position: "absolute", left: 0, right: 0, bottom: 0, height: `${(d.leads / Math.max(1, d.views)) * 100}%`, minHeight: 3, bgcolor: tokens.primary, borderRadius: d.leads >= d.views ? "4px 4px 0 0" : 0 }} />}
                  </Box>
                </Box>
              </Tooltip>
            ))}
          </Box>
        </Box>
      </Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", pl: "36px", mt: 0.5, fontSize: 11, color: "text.secondary" }}>
        <span>{dayLabel(days[0].day)}</span>
        <span>{dayLabel(days[days.length - 1].day)}</span>
      </Box>
    </Box>
  );
}

const LIGHT = `color-mix(in srgb, ${tokens.primary} 28%, transparent)`;

/** A round top for the axis: 7 → 8, 23 → 25, 140 → 150. */
function niceMax(n: number): number {
  const step = n <= 10 ? 2 : n <= 50 ? 10 : n <= 200 ? 50 : 100;
  return Math.max(step, Math.ceil(n / step) * step);
}

function Sources({ sources }: { sources: { name: string; views: number; leads: number }[] }) {
  return (
    <Box>
      <Heading sub="From the link they came in on (ad links say Facebook ad).">Where visitors came from</Heading>
      <Box sx={{ overflowX: "auto" }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ color: "text.secondary", fontWeight: 500 }}>Came from</TableCell>
              <TableCell align="right" sx={{ color: "text.secondary", fontWeight: 500 }}>Visitors</TableCell>
              <TableCell align="right" sx={{ color: "text.secondary", fontWeight: 500 }}>Leads</TableCell>
              <TableCell align="right" sx={{ color: "text.secondary", fontWeight: 500 }}>Became leads</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sources.slice(0, 8).map((r) => (
              <TableRow key={r.name}>
                <TableCell sx={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</TableCell>
                <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>{r.views}</TableCell>
                <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>{r.leads}</TableCell>
                <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>{r.views ? `${pct(r.leads, r.views)}%` : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
    </Box>
  );
}

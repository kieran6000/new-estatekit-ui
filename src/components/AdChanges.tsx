import { useMemo, useState, type ReactNode } from "react";
import { Box, Button, Chip, Skeleton, Tooltip, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutlined";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import PowerSettingsNewIcon from "@mui/icons-material/PowerSettingsNew";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import RemoveIcon from "@mui/icons-material/Remove";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import TuneIcon from "@mui/icons-material/Tune";
import { supabase } from "../api/_client";
import { getAdHistory, type AdHistoryItem } from "../api/agentProfile";
import { getSpendDaily } from "../api/clients";
import { plainChange, worthShowing } from "../lib/adHistory";
import { addDays, changeKind, chartBuckets, impactOf, isDecision, WINDOW_DAYS, type ChangeKind, type Impact, type Verdict } from "../lib/changeImpact";
import { tokens } from "../theme";

const DAYS_SHOWN = 5;
const CHANGES_PER_DAY = 3;
const saDay = (iso: string | number | Date) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" });
const niceDay = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const shortDay = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const rand = (n: number) => "R" + Math.round(n).toLocaleString("en-GB").replace(/,/g, " ");

const KINDS: { key: ChangeKind | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "budget", label: "Budget" },
  { key: "onoff", label: "On / off" },
  { key: "new", label: "New" },
  { key: "billing", label: "Billing" },
  { key: "other", label: "Other" },
];
const KIND_ICON: Record<ChangeKind, typeof TuneIcon> = { budget: PaymentsOutlinedIcon, onoff: PowerSettingsNewIcon, new: AddCircleOutlineIcon, billing: ReceiptLongOutlinedIcon, other: TuneIcon };
const OBJECT: Record<string, string> = { CAMPAIGN_GROUP: "Campaign", CAMPAIGN: "Ad set", ADGROUP: "Ad", AD_SET: "Ad set", AD: "Ad", ACCOUNT: "Ad account", AD_ACCOUNT: "Ad account" };

const VERDICT: Record<Verdict, { label: string; icon: typeof TuneIcon; color: string; bg: string }> = {
  better: { label: "Leads got cheaper", icon: TrendingDownIcon, color: tokens.greenDark, bg: tokens.greenTint },
  worse: { label: "Leads cost more", icon: TrendingUpIcon, color: tokens.amber, bg: tokens.amberTint },
  same: { label: "About the same", icon: RemoveIcon, color: tokens.ink2, bg: tokens.surface2 },
  soon: { label: "Too soon to tell", icon: HourglassEmptyIcon, color: tokens.ink2, bg: tokens.surface2 },
  few: { label: "Too few leads to tell", icon: HourglassEmptyIcon, color: tokens.ink2, bg: tokens.surface2 },
  not_running: { label: "Ads weren't running", icon: PowerSettingsNewIcon, color: tokens.ink2, bg: tokens.surface2 },
};

async function leadsPerDay(agentId: string, since: string): Promise<Record<string, number>> {
  const { data, error } = await supabase.from("leads").select("created_at").eq("agent_id", agentId).gte("created_at", `${since}T00:00:00+02:00`).order("created_at", { ascending: false }).limit(5000);
  if (error) throw error;
  const out: Record<string, number> = {};
  for (const l of data ?? []) { const d = saDay(l.created_at as string); out[d] = (out[d] ?? 0) + 1; }
  return out;
}

function VerdictPill({ verdict }: { verdict: Verdict }) {
  const v = VERDICT[verdict];
  const Icon = v.icon;
  return (
    <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, px: 0.875, py: 0.25, borderRadius: "999px", bgcolor: v.bg, color: v.color }}>
      <Icon sx={{ fontSize: 16 }} />
      <Typography component="span" sx={{ fontSize: 12.5, fontWeight: 600, color: "inherit" }}>{v.label}</Typography>
    </Box>
  );
}

/** The week before against the week after, side by side. */
function BeforeAfter({ impact }: { impact: Impact }) {
  const biggest = Math.max(impact.before.leads, impact.after.leads, 1);
  const line = (label: string, p: Impact["before"]) => (
    <Box sx={{ display: "grid", gridTemplateColumns: "46px minmax(0, 1fr) 124px", alignItems: "center", columnGap: 1 }}>
      <Typography sx={{ fontSize: 12.5, color: tokens.ink2 }}>{label}</Typography>
      <Box sx={{ height: 8, borderRadius: "4px", bgcolor: tokens.surface2, overflow: "hidden" }}>
        <Box sx={{ height: "100%", width: `${(p.leads / biggest) * 100}%`, minWidth: p.leads ? 6 : 0, bgcolor: tokens.primary, borderRadius: "4px" }} />
      </Box>
      <Typography sx={{ fontSize: 12.5, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
        <b>{p.leads}</b> {p.leads === 1 ? "lead" : "leads"}{p.costPerLead !== null ? ` · ${rand(p.costPerLead)} each` : ""}
      </Typography>
    </Box>
  );
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
      {line("Before", impact.before)}
      {line("After", impact.after)}
    </Box>
  );
}

function ChangeLine({ it }: { it: AdHistoryItem }) {
  const Icon = KIND_ICON[changeKind(it)];
  const change = plainChange(it);
  return (
    <Box sx={{ display: "flex", gap: 1, minWidth: 0 }}>
      <Icon sx={{ fontSize: 18, color: tokens.ink3, mt: "2px", flex: "none" }} />
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 14 }}>
          {it.what}
          {change && <Box component="span" sx={{ color: tokens.ink2 }}> · {change.from ? `${change.from} → ` : ""}<b>{change.to || "—"}</b></Box>}
        </Typography>
        <Typography sx={{ fontSize: 12.5, color: tokens.ink2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {OBJECT[it.objectType] ?? "Item"}: {it.objectName} · {new Date(it.at).toLocaleTimeString("en-GB", { timeZone: "Africa/Johannesburg", hour: "2-digit", minute: "2-digit" })} · {it.who || "Facebook"}
        </Typography>
      </Box>
    </Box>
  );
}

function DayCard({ day, items, impact }: { day: string; items: AdHistoryItem[]; impact: Impact | null }) {
  const [open, setOpen] = useState(false);
  const shown = open ? items : items.slice(0, CHANGES_PER_DAY);
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "minmax(0, 1fr) 300px" }, gap: { xs: 1.25, md: 3 }, py: 1.5, borderTop: `1px solid ${tokens.divider2}` }}>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 0.75 }}>{niceDay(day)}</Typography>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.875 }}>
          {shown.map((it, i) => <ChangeLine key={i} it={it} />)}
        </Box>
        {items.length > CHANGES_PER_DAY && (
          <Button size="small" onClick={() => setOpen((v) => !v)} sx={{ mt: 0.5, ml: -0.75 }}>{open ? "Show fewer" : `${items.length - CHANGES_PER_DAY} more that day`}</Button>
        )}
      </Box>
      {impact && (
        <Box sx={{ minWidth: 0 }}>
          <Box sx={{ mb: 0.75 }}><VerdictPill verdict={impact.verdict} /></Box>
          <BeforeAfter impact={impact} />
        </Box>
      )}
    </Box>
  );
}

function Stat({ n, label, children }: { n: number; label: string; children?: ReactNode }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
      {children}
      <Typography sx={{ fontSize: 14 }}><b>{n}</b> {label}</Typography>
    </Box>
  );
}

/** What was changed on their ads and what happened to their leads next, so it's
 *  easy to see what worked. Leads are bars; each change is a dot underneath. */
export default function AdChanges({ agentId, acct, since, until }: { agentId: string; acct: string | null | undefined; since: string; until: string }) {
  const [kind, setKind] = useState<ChangeKind | "all">("all");
  const [picked, setPicked] = useState<{ start: string; end: string } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const from = addDays(since, -WINDOW_DAYS);
  const today = saDay(Date.now());

  const history = useQuery({ queryKey: ["adHistory", acct, since, until], queryFn: () => getAdHistory(acct!, since, until), enabled: !!acct, staleTime: 5 * 60_000, retry: false });
  const leads = useQuery({ queryKey: ["leadsPerDay", agentId, from], queryFn: () => leadsPerDay(agentId, from), staleTime: 5 * 60_000 });
  const spend = useQuery({ queryKey: ["spendDaily", acct, from], queryFn: () => getSpendDaily(acct!, from), enabled: !!acct, staleTime: 30 * 60_000, retry: false });

  const items = useMemo(() => (history.data?.items ?? []).filter(worthShowing), [history.data]);
  const byDay = useMemo(() => {
    const m = new Map<string, AdHistoryItem[]>();
    for (const it of items) { const d = saDay(it.at); m.set(d, [...(m.get(d) ?? []), it]); }
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [items]);
  const leadMap = leads.data ?? {};
  const spendMap = spend.data ?? null;
  const impactFor = (day: string, list: AdHistoryItem[]) => (spendMap && list.some(isDecision) ? impactOf(day, today, leadMap, spendMap) : null);

  const judged = byDay.flatMap(([day, list]) => { const i = impactFor(day, list); return i ? [{ day, list, impact: i }] : []; });
  const tally = (v: Verdict) => judged.filter((j) => j.impact.verdict === v).length;
  const best = judged
    .filter((j) => j.impact.verdict === "better" && j.impact.before.costPerLead && j.impact.after.costPerLead)
    .sort((a, b) => a.impact.after.costPerLead! / a.impact.before.costPerLead! - b.impact.after.costPerLead! / b.impact.before.costPerLead!)[0];

  const buckets = chartBuckets(since, until);
  const bars = buckets.map((b) => {
    let n = 0, cost = 0;
    for (let d = b.start; d <= b.end; d = addDays(d, 1)) { n += leadMap[d] ?? 0; cost += Number(spendMap?.[d]) || 0; }
    const changes = byDay.filter(([d]) => d >= b.start && d <= b.end).flatMap(([, l]) => l).filter(isDecision).length;
    return { ...b, leads: n, cost, changes };
  });
  const tallest = Math.max(...bars.map((b) => b.leads), 1);

  const counts = (k: ChangeKind | "all") => (k === "all" ? items.length : items.filter((i) => changeKind(i) === k).length);
  const visible = byDay
    .filter(([d]) => !picked || (d >= picked.start && d <= picked.end))
    .map(([d, l]) => [d, l.filter((i) => kind === "all" || changeKind(i) === kind)] as const)
    .filter(([, l]) => l.length);
  const shownDays = showAll ? visible : visible.slice(0, DAYS_SHOWN);

  return (
    <Box sx={{ bgcolor: "background.paper", border: `1px solid ${tokens.divider}`, borderRadius: "8px", overflow: "hidden", minWidth: 0 }}>
      <Box sx={{ px: 2, pt: 1.5, pb: 0.5, minHeight: 40, display: "flex", alignItems: "center", gap: 1 }}>
        <Typography sx={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: tokens.ink2, flex: 1 }}>What we changed, and what happened next</Typography>
        <Typography sx={{ fontSize: 11.5, color: tokens.ink3 }}>In the dates above</Typography>
      </Box>
      <Box sx={{ px: 2, pb: 2 }}>
        {!acct ? (
          <Typography sx={{ fontSize: 14, color: tokens.ink2 }}>No ad account linked. Add it under Settings → Ads & Facebook.</Typography>
        ) : history.isLoading || leads.isLoading ? (
          <Skeleton variant="rectangular" height={180} sx={{ borderRadius: "6px" }} />
        ) : history.isError || history.data?.note ? (
          <Typography sx={{ fontSize: 14, color: tokens.ink2 }}>
            {history.data?.note === "busy" ? "Facebook is busy right now. Try again in a few minutes." : "Couldn't read the changes from Facebook. Try again in a minute."}
          </Typography>
        ) : (
          <>
            {judged.length > 0 && (
              <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: 2.5, rowGap: 0.5, mb: 1.5 }}>
                <Stat n={tally("better")} label="made leads cheaper"><TrendingDownIcon sx={{ fontSize: 18, color: tokens.greenDark }} /></Stat>
                <Stat n={tally("worse")} label="made leads cost more"><TrendingUpIcon sx={{ fontSize: 18, color: tokens.amber }} /></Stat>
                <Stat n={tally("same")} label="about the same"><RemoveIcon sx={{ fontSize: 18, color: tokens.ink3 }} /></Stat>
                {best && (
                  <Typography sx={{ fontSize: 13, color: tokens.ink2, ml: { md: "auto" } }}>
                    Best: {shortDay(best.day)}, {rand(best.impact.before.costPerLead!)} to <b>{rand(best.impact.after.costPerLead!)}</b> a lead
                  </Typography>
                )}
              </Box>
            )}

            <Typography sx={{ fontSize: 12.5, color: tokens.ink2, mb: 0.5 }}>Leads {buckets[0] && buckets[0].start !== buckets[0].end ? "per period" : "per day"} · most: {tallest}</Typography>
            <Box role="img" aria-label="Leads over time, with a dot under each period when a change was made" sx={{ display: "flex", alignItems: "stretch", gap: "2px" }}>
              {bars.map((b) => {
                const on = picked?.start === b.start;
                return (
                  <Tooltip
                    key={b.start}
                    arrow
                    title={
                      <Box sx={{ py: 0.25 }}>
                        <Typography sx={{ fontSize: 12.5, fontWeight: 600 }}>{b.start === b.end ? niceDay(b.start) : `${shortDay(b.start)} to ${shortDay(b.end)}`}</Typography>
                        <Typography sx={{ fontSize: 12.5 }}>{b.leads} {b.leads === 1 ? "lead" : "leads"}{spendMap ? ` · ${rand(b.cost)} spent` : ""}</Typography>
                        {b.changes > 0 && <Typography sx={{ fontSize: 12.5 }}>{b.changes} {b.changes === 1 ? "change" : "changes"}. Click to see</Typography>}
                      </Box>
                    }
                  >
                    <Box
                      component={b.changes ? "button" : "div"}
                      onClick={b.changes ? () => { setPicked(on ? null : { start: b.start, end: b.end }); setShowAll(false); } : undefined}
                      aria-label={b.changes ? `${b.changes} changes on ${b.start}` : undefined}
                      sx={{ flex: "1 1 0", minWidth: 0, p: 0, border: 0, bgcolor: "transparent", cursor: b.changes ? "pointer" : "default", display: "flex", flexDirection: "column", "&:hover .bar": { opacity: 0.75 } }}
                    >
                      <Box sx={{ height: 72, display: "flex", alignItems: "flex-end", borderBottom: `1px solid ${tokens.divider}` }}>
                        <Box className="bar" sx={{ width: "100%", height: `${(b.leads / tallest) * 100}%`, minHeight: b.leads ? 3 : 0, borderRadius: "3px 3px 0 0", bgcolor: tokens.primary, opacity: picked && !on ? 0.3 : 1 }} />
                      </Box>
                      <Box sx={{ height: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {b.changes > 0 && <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: on ? tokens.primary : tokens.ink, flex: "none" }} />}
                      </Box>
                    </Box>
                  </Tooltip>
                );
              })}
            </Box>
            <Box sx={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: tokens.ink3 }}>
              <span>{shortDay(since)}</span>
              <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
                <Box component="span" sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: tokens.ink }} /> A change was made
              </Box>
              <span>{shortDay(until)}</span>
            </Box>

            <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 0.75, mt: 1.75, mb: 1.25 }}>
              {KINDS.filter((k) => k.key === "all" || counts(k.key) > 0).map((k) => (
                <Chip key={k.key} size="small" label={`${k.label} ${counts(k.key)}`} variant={kind === k.key ? "filled" : "outlined"} color={kind === k.key ? "primary" : "default"} onClick={() => { setKind(k.key); setShowAll(false); }} sx={{ borderRadius: "6px" }} />
              ))}
              {picked && <Chip size="small" label={`${shortDay(picked.start)} only · clear`} onDelete={() => setPicked(null)} sx={{ borderRadius: "6px" }} />}
            </Box>

            {!visible.length ? (
              <Typography sx={{ fontSize: 14, color: tokens.ink2 }}>No changes in these dates.</Typography>
            ) : (
              shownDays.map(([day, list]) => <DayCard key={day} day={day} items={list} impact={impactFor(day, byDay.find(([d]) => d === day)![1])} />)
            )}
            {visible.length > DAYS_SHOWN && (
              <Button size="small" onClick={() => setShowAll((v) => !v)} sx={{ mt: 0.5 }}>{showAll ? "Show fewer" : `Show all ${visible.length} days`}</Button>
            )}
            <Typography sx={{ fontSize: 12, color: tokens.ink3, mt: 1.25 }}>
              Before and after compare {WINDOW_DAYS} days either side, for the whole account. It shows what followed a change, not proof of what caused it.
            </Typography>
          </>
        )}
      </Box>
    </Box>
  );
}

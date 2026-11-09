import { useEffect, useMemo, useState } from "react";
import RocketLaunchOutlinedIcon from "@mui/icons-material/RocketLaunchOutlined";
import { Box, Button, Chip, Skeleton, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import GpsFixedIcon from "@mui/icons-material/GpsFixed";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import SpeedIcon from "@mui/icons-material/Speed";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import PowerSettingsNewIcon from "@mui/icons-material/PowerSettingsNew";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import TuneIcon from "@mui/icons-material/Tune";
import { supabase } from "../api/_client";
import { getAdHistory, type AdHistoryItem } from "../api/agentProfile";
import { adsManagerUrl, getSpendDaily } from "../api/clients";
import { addDays, changeKind, isKeyChange, plainChange, summariseDay, targetingDiff, worthShowing, type ChangeKind } from "../lib/adHistory";
import ChangeCalendar, { type CalendarDay } from "./ChangeCalendar";
import { tokens } from "../theme";

const DAYS_SHOWN = 5;
const CHANGES_PER_DAY = 3;
const saDay = (iso: string | number | Date) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" });
const niceDay = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const shortDay = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const rand = (n: number) => "R" + Math.round(n).toLocaleString("en-GB").replace(/,/g, " ");
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

const KIND_ICON: Record<ChangeKind, typeof TuneIcon> = { targeting: GpsFixedIcon, budget: PaymentsOutlinedIcon, bidding: SpeedIcon, creative: ImageOutlinedIcon, onoff: PowerSettingsNewIcon, billing: ReceiptLongOutlinedIcon, other: TuneIcon };
const SHOWN_BITS = 6;
const listOf = (bits: string[]) => bits.slice(0, SHOWN_BITS).join(", ") + (bits.length > SHOWN_BITS ? ` +${bits.length - SHOWN_BITS} more` : "");
const OBJECT: Record<string, string> = { CAMPAIGN_GROUP: "Campaign", CAMPAIGN: "Ad set", ADGROUP: "Ad", AD_SET: "Ad set", AD: "Ad", ACCOUNT: "Ad account", AD_ACCOUNT: "Ad account" };

async function leadsPerDay(agentId: string, since: string): Promise<Record<string, number>> {
  const { data, error } = await supabase.from("leads").select("created_at").eq("agent_id", agentId).gte("created_at", `${since}T00:00:00+02:00`).order("created_at", { ascending: false }).limit(5000);
  if (error) throw error;
  const out: Record<string, number> = {};
  for (const l of data ?? []) { const d = saDay(l.created_at as string); out[d] = (out[d] ?? 0) + 1; }
  return out;
}

function ChangeLine({ it, times }: { it: AdHistoryItem; times: number }) {
  const Icon = KIND_ICON[changeKind(it)];
  const isTargeting = changeKind(it) === "targeting";
  const change = isTargeting ? null : plainChange(it);
  const diff = isTargeting && it.change?.from ? targetingDiff(it.change.from, it.change.to) : null;
  return (
    <Box sx={{ display: "flex", gap: 1, minWidth: 0 }}>
      <Icon sx={{ fontSize: 18, color: tokens.ink3, mt: "2px", flex: "none" }} />
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 14 }}>
          {it.what}{times > 1 && <Box component="span" sx={{ color: tokens.ink2 }}> × {times}</Box>}
          {change && <Box component="span" sx={{ color: tokens.ink2 }}> · {change.from ? `${change.from} → ` : ""}<b>{change.to || "—"}</b></Box>}
          {diff && diff.added.length > 0 && <Box component="span" sx={{ color: tokens.ink2 }}> · Added: <b>{listOf(diff.added)}</b></Box>}
          {diff && diff.removed.length > 0 && <Box component="span" sx={{ color: tokens.ink2 }}> · Removed: <b>{listOf(diff.removed)}</b></Box>}
        </Typography>
        <Typography sx={{ fontSize: 12.5, color: tokens.ink2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {OBJECT[it.objectType] ?? "Item"}: {it.objectName} · {new Date(it.at).toLocaleTimeString("en-GB", { timeZone: "Africa/Johannesburg", hour: "2-digit", minute: "2-digit" })} · {it.who || "Facebook"}
        </Typography>
      </Box>
    </Box>
  );
}

function DayRow({ day, items, leads, spent }: { day: string; items: AdHistoryItem[]; leads: number; spent: number | null }) {
  const [open, setOpen] = useState(false);
  const { launch, pictures, rows } = useMemo(() => summariseDay(items), [items]);
  const shown = open ? rows : rows.slice(0, CHANGES_PER_DAY);
  const launched = launch ? [launch.campaigns && plural(launch.campaigns, "campaign"), launch.adSets && plural(launch.adSets, "ad set"), launch.ads && plural(launch.ads, "ad")].filter(Boolean).join(", ") : "";
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "130px minmax(0, 1fr)" }, columnGap: 2, rowGap: 0.75, py: 1.5, borderTop: `1px solid ${tokens.divider2}` }}>
      <Box>
        <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>{niceDay(day)}</Typography>
        <Typography sx={{ fontSize: 12.5, color: tokens.ink2 }}>{plural(leads, "lead")}{spent !== null ? ` · ${rand(spent)} spent` : ""}</Typography>
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.875 }}>
          {launched && (
            <Box sx={{ display: "flex", gap: 1 }}>
              <RocketLaunchOutlinedIcon sx={{ fontSize: 18, color: tokens.ink3, mt: "2px", flex: "none" }} />
              <Typography sx={{ fontSize: 14 }}>New: <b>{launched}</b></Typography>
            </Box>
          )}
          {pictures > 0 && (
            <Box sx={{ display: "flex", gap: 1 }}>
              <ImageOutlinedIcon sx={{ fontSize: 18, color: tokens.ink3, mt: "2px", flex: "none" }} />
              <Typography sx={{ fontSize: 14 }}>Pictures changed on <b>{plural(pictures, "ad")}</b></Typography>
            </Box>
          )}
          {shown.map((g, i) => <ChangeLine key={i} it={g.it} times={g.times} />)}
        </Box>
        {rows.length > CHANGES_PER_DAY && (
          <Button size="small" onClick={() => setOpen((v) => !v)} sx={{ mt: 0.5, ml: -0.75 }}>{open ? "Show fewer" : `${rows.length - CHANGES_PER_DAY} more that day`}</Button>
        )}
      </Box>
    </Box>
  );
}

/** What was changed on their ads and when, on a timeline with their leads, so
 *  whoever's looking can see what happened next for themselves. */
export default function AdChanges({ agentId, acct, since, until }: { agentId: string; acct: string | null | undefined; since: string; until: string }) {
  const [picked, setPicked] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  useEffect(() => { setPicked(null); setShowAll(false); }, [since, until]);

  const history = useQuery({ queryKey: ["adHistory", acct, since, until], queryFn: () => getAdHistory(acct!, since, until), enabled: !!acct, staleTime: 5 * 60_000, retry: false });
  const leads = useQuery({ queryKey: ["leadsPerDay", agentId, since], queryFn: () => leadsPerDay(agentId, since), staleTime: 5 * 60_000 });
  const spend = useQuery({ queryKey: ["spendDaily", acct, since], queryFn: () => getSpendDaily(acct!, since), enabled: !!acct, staleTime: 30 * 60_000, retry: false });

  const items = useMemo(() => (history.data?.items ?? []).filter(worthShowing), [history.data]);
  const byDay = useMemo(() => {
    const m = new Map<string, AdHistoryItem[]>();
    for (const it of items) {
      if (!isKeyChange(it)) continue;
      const d = saDay(it.at);
      m.set(d, [...(m.get(d) ?? []), it]);
    }
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [items]);
  const leadMap = leads.data ?? {};
  const spendMap = spend.data ?? null;

  // Each day: leads, spend and how many changes, for the calendar.
  const calendar = useMemo(() => {
    const out: Record<string, CalendarDay> = {};
    for (let d = since; d <= until; d = addDays(d, 1)) out[d] = { leads: leadMap[d] ?? 0, spent: spendMap ? Number(spendMap[d]) || 0 : null, changes: 0 };
    for (const [d, list] of byDay) {
      const day = summariseDay(list);
      if (out[d]) out[d].changes = day.rows.length + (day.launch ? 1 : 0) + (day.pictures ? 1 : 0);
    }
    return out;
  }, [since, until, leadMap, spendMap, byDay]);

  const visible = byDay.filter(([d]) => !picked || d === picked);
  const shownDays = showAll ? visible : visible.slice(0, DAYS_SHOWN);

  return (
    <Box sx={{ bgcolor: "background.paper", border: `1px solid ${tokens.divider}`, borderRadius: "8px", overflow: "hidden", minWidth: 0 }}>
      <Box sx={{ px: 2, pt: 1.5, pb: 0.5, minHeight: 40, display: "flex", alignItems: "center", gap: 1 }}>
        <Typography sx={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: tokens.ink2, flex: 1 }}>What changed on their ads</Typography>
        <Typography sx={{ fontSize: 11.5, color: tokens.ink3 }}>{shortDay(since)} to {shortDay(until)}</Typography>
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
            <ChangeCalendar since={since} until={until} days={calendar} picked={picked} onPick={(d) => { setPicked(d); setShowAll(false); }} />

            <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 0.75, mt: 2, mb: 1 }}>
              {picked && <Chip size="small" label={`Only ${niceDay(picked)}`} onDelete={() => setPicked(null)} sx={{ borderRadius: "6px" }} />}
            </Box>

            {!visible.length ? (
              <Typography sx={{ fontSize: 14, color: tokens.ink2 }}>No budget, targeting, bid or new ad changes in these dates.</Typography>
            ) : (
              shownDays.map(([day, list]) => <DayRow key={day} day={day} items={list} leads={leadMap[day] ?? 0} spent={spendMap ? Number(spendMap[day]) || 0 : null} />)
            )}
            {visible.length > DAYS_SHOWN && (
              <Button size="small" onClick={() => setShowAll((v) => !v)} sx={{ mt: 0.5 }}>{showAll ? "Show fewer" : `Show all ${visible.length} days`}</Button>
            )}
            <Typography sx={{ fontSize: 12.5, color: tokens.ink2, mt: 1 }}>
              Showing budget, targeting, bid and new ad changes. <Box component="a" href={adsManagerUrl(acct)} target="_blank" rel="noopener" sx={{ color: "primary.main" }}>The full log is in Ads Manager</Box>.
            </Typography>
          </>
        )}
      </Box>
    </Box>
  );
}

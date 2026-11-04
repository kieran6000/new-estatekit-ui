import { useEffect, useMemo, useState } from "react";
import { Box, Button, Chip, Skeleton, Tooltip, Typography, useMediaQuery } from "@mui/material";
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
import { getSpendDaily } from "../api/clients";
import { addDays, changedImages, changeKind, KEY_KINDS, plainChange, scaleTop, timelineSteps, worthShowing, type ChangeKind } from "../lib/adHistory";
import { tokens } from "../theme";

const DAYS_SHOWN = 5;
const CHANGES_PER_DAY = 3;
const BAR_HEIGHT = 72;
const BAR_MAX_WIDTH = 28;
const GUTTER = 58;
const saDay = (iso: string | number | Date) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" });
const niceDay = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const shortDay = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const rand = (n: number) => "R" + Math.round(n).toLocaleString("en-GB").replace(/,/g, " ");
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

type Filter = ChangeKind | "key";
const KINDS: { key: Filter; label: string }[] = [
  { key: "key", label: "Key changes" },
  { key: "targeting", label: "Targeting" },
  { key: "budget", label: "Budget" },
  { key: "bidding", label: "Bid & goal" },
  { key: "creative", label: "Ads & creative" },
  { key: "onoff", label: "On / off" },
  { key: "billing", label: "Billing" },
  { key: "other", label: "Other" },
];
const KIND_ICON: Record<ChangeKind, typeof TuneIcon> = { targeting: GpsFixedIcon, budget: PaymentsOutlinedIcon, bidding: SpeedIcon, creative: ImageOutlinedIcon, onoff: PowerSettingsNewIcon, billing: ReceiptLongOutlinedIcon, other: TuneIcon };
const inFilter = (f: Filter, k: ChangeKind) => (f === "key" ? KEY_KINDS.includes(k) : f === k);
const OBJECT: Record<string, string> = { CAMPAIGN_GROUP: "Campaign", CAMPAIGN: "Ad set", ADGROUP: "Ad", AD_SET: "Ad set", AD: "Ad", ACCOUNT: "Ad account", AD_ACCOUNT: "Ad account" };

async function leadsPerDay(agentId: string, since: string): Promise<Record<string, number>> {
  const { data, error } = await supabase.from("leads").select("created_at").eq("agent_id", agentId).gte("created_at", `${since}T00:00:00+02:00`).order("created_at", { ascending: false }).limit(5000);
  if (error) throw error;
  const out: Record<string, number> = {};
  for (const l of data ?? []) { const d = saDay(l.created_at as string); out[d] = (out[d] ?? 0) + 1; }
  return out;
}

/** An ad's picture. Facebook's addresses expire or get refused, so one that
 *  doesn't load tells the row, which then leaves the pictures out. */
function Thumb({ src, label, onFail }: { src: string | null; label: string; onFail: () => void }) {
  if (!src) return null;
  return (
    <Box sx={{ width: 64, flex: "none" }}>
      <Box component="img" src={src} alt={`The ad's picture, ${label.toLowerCase()}`} loading="lazy" referrerPolicy="no-referrer" onError={onFail} sx={{ display: "block", width: 64, height: 64, objectFit: "cover", borderRadius: "6px", border: `1px solid ${tokens.divider}` }} />
      <Typography sx={{ fontSize: 11.5, color: tokens.ink2, textAlign: "center", mt: 0.25 }}>{label}</Typography>
    </Box>
  );
}

function ChangeLine({ it, times }: { it: AdHistoryItem; times: number }) {
  const Icon = KIND_ICON[changeKind(it)];
  const change = plainChange(it);
  const images = changedImages(it);
  const [noPictures, setNoPictures] = useState(false);
  return (
    <Box sx={{ display: "flex", gap: 1, minWidth: 0 }}>
      <Icon sx={{ fontSize: 18, color: tokens.ink3, mt: "2px", flex: "none" }} />
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 14 }}>
          {it.what}{times > 1 && <Box component="span" sx={{ color: tokens.ink2 }}> × {times}</Box>}
          {change && <Box component="span" sx={{ color: tokens.ink2 }}> · {change.from ? `${change.from} → ` : ""}<b>{change.to || "—"}</b></Box>}
          {images && <Box component="span" sx={{ color: tokens.ink2 }}> · Picture changed</Box>}
        </Typography>
        <Typography sx={{ fontSize: 12.5, color: tokens.ink2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {OBJECT[it.objectType] ?? "Item"}: {it.objectName} · {new Date(it.at).toLocaleTimeString("en-GB", { timeZone: "Africa/Johannesburg", hour: "2-digit", minute: "2-digit" })} · {it.who || "Facebook"}
        </Typography>
        {images && !noPictures && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.75 }}>
            <Thumb src={images.from} label="Before" onFail={() => setNoPictures(true)} />
            {images.from && images.to && <Box component="span" sx={{ color: tokens.ink3, mb: 2 }}>→</Box>}
            <Thumb src={images.to} label="After" onFail={() => setNoPictures(true)} />
          </Box>
        )}
      </Box>
    </Box>
  );
}

function DayRow({ day, items, leads, spent }: { day: string; items: AdHistoryItem[]; leads: number; spent: number | null }) {
  const [open, setOpen] = useState(false);
  const groups = useMemo(() => {
    const seen = new Map<string, { it: AdHistoryItem; times: number }>();
    for (const it of items) {
      const key = [it.what, it.objectName, it.change?.from, it.change?.to].join("|");
      const hit = seen.get(key);
      if (hit) hit.times += 1;
      else seen.set(key, { it, times: 1 });
    }
    return [...seen.values()];
  }, [items]);
  const shown = open ? groups : groups.slice(0, CHANGES_PER_DAY);
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "130px minmax(0, 1fr)" }, columnGap: 2, rowGap: 0.75, py: 1.5, borderTop: `1px solid ${tokens.divider2}` }}>
      <Box>
        <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>{niceDay(day)}</Typography>
        <Typography sx={{ fontSize: 12.5, color: tokens.ink2 }}>{plural(leads, "lead")}{spent !== null ? ` · ${rand(spent)} spent` : ""}</Typography>
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.875 }}>
          {shown.map((g, i) => <ChangeLine key={i} it={g.it} times={g.times} />)}
        </Box>
        {groups.length > CHANGES_PER_DAY && (
          <Button size="small" onClick={() => setOpen((v) => !v)} sx={{ mt: 0.5, ml: -0.75 }}>{open ? "Show fewer" : `${groups.length - CHANGES_PER_DAY} more that day`}</Button>
        )}
      </Box>
    </Box>
  );
}

/** What was changed on their ads and when, on a timeline with their leads, so
 *  whoever's looking can see what happened next for themselves. */
export default function AdChanges({ agentId, acct, since, until }: { agentId: string; acct: string | null | undefined; since: string; until: string }) {
  const [kind, setKind] = useState<Filter>("key");
  const [picked, setPicked] = useState<{ start: string; end: string } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const phone = useMediaQuery("(max-width:600px)");
  useEffect(() => { setPicked(null); setShowAll(false); }, [since, until]);

  const history = useQuery({ queryKey: ["adHistory", acct, since, until], queryFn: () => getAdHistory(acct!, since, until), enabled: !!acct, staleTime: 5 * 60_000, retry: false });
  const leads = useQuery({ queryKey: ["leadsPerDay", agentId, since], queryFn: () => leadsPerDay(agentId, since), staleTime: 5 * 60_000 });
  const spend = useQuery({ queryKey: ["spendDaily", acct, since], queryFn: () => getSpendDaily(acct!, since), enabled: !!acct, staleTime: 30 * 60_000, retry: false });

  const items = useMemo(() => (history.data?.items ?? []).filter(worthShowing), [history.data]);
  const counts = (f: Filter) => items.filter((i) => inFilter(f, changeKind(i))).length;
  const byDay = useMemo(() => {
    const m = new Map<string, AdHistoryItem[]>();
    for (const it of items) {
      if (!inFilter(kind, changeKind(it))) continue;
      const d = saDay(it.at);
      m.set(d, [...(m.get(d) ?? []), it]);
    }
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [items, kind]);
  const leadMap = leads.data ?? {};
  const spendMap = spend.data ?? null;

  const { unit, steps } = timelineSteps(since, until);
  const bars = steps.map((b) => {
    let n = 0, cost = 0;
    for (let d = b.start; d <= b.end; d = addDays(d, 1)) { n += leadMap[d] ?? 0; cost += Number(spendMap?.[d]) || 0; }
    const changes = byDay.filter(([d]) => d >= b.start && d <= b.end).reduce((sum, [, l]) => sum + l.length, 0);
    return { ...b, leads: n, cost, changes };
  });
  const top = scaleTop(Math.max(...bars.map((b) => b.leads), 0));
  const labelEvery = Math.max(1, Math.ceil(bars.length / (phone ? 4 : 8)));
  const small = phone || bars.length > 40;

  const visible = byDay.filter(([d]) => !picked || (d >= picked.start && d <= picked.end));
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
            <Typography sx={{ fontSize: 13.5, color: tokens.ink2, mb: 1.25 }}>
              Blue bars are their leads each {unit}. A dark circle marks a day something was changed, and the number says how many things. Click a circle to see them.
            </Typography>

            <Box sx={{ display: "flex", minWidth: 0 }}>
              {/* The scale, and the name of the changes row. */}
              <Box sx={{ width: GUTTER, flex: "none", pr: 1, textAlign: "right", fontSize: 12, color: tokens.ink2 }}>
                <Box sx={{ height: BAR_HEIGHT, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                  <Box sx={{ lineHeight: 1, mt: "-2px" }}>{top}</Box>
                  <Box sx={{ lineHeight: 1 }}>{top / 2}</Box>
                  <Box sx={{ lineHeight: 1, mb: "-2px" }}>0</Box>
                </Box>
                <Box sx={{ height: 30, display: "flex", alignItems: "center", justifyContent: "flex-end", fontWeight: 600 }}>Changes</Box>
              </Box>

              <Box sx={{ position: "relative", flex: 1, minWidth: 0 }}>
                {/* Lines at the top and middle of the scale. */}
                {[0, BAR_HEIGHT / 2].map((y) => <Box key={y} sx={{ position: "absolute", top: y, left: 0, right: 0, borderTop: `1px solid ${tokens.divider2}` }} />)}
                <Box sx={{ position: "relative", display: "flex", gap: "2px" }}>
                  {bars.map((b, i) => {
                    const on = picked?.start === b.start;
                    return (
                      <Tooltip
                        key={b.start}
                        arrow
                        title={
                          <Box sx={{ py: 0.25 }}>
                            <Typography sx={{ fontSize: 12.5, fontWeight: 600 }}>{b.start === b.end ? niceDay(b.start) : `${shortDay(b.start)} to ${shortDay(b.end)}`}</Typography>
                            <Typography sx={{ fontSize: 12.5 }}>{plural(b.leads, "lead")}{spendMap ? ` · ${rand(b.cost)} spent` : ""}</Typography>
                            {b.changes > 0 && <Typography sx={{ fontSize: 12.5 }}>{plural(b.changes, "change")}. Click to see</Typography>}
                          </Box>
                        }
                      >
                        <Box
                          component={b.changes ? "button" : "div"}
                          type={b.changes ? "button" : undefined}
                          onClick={b.changes ? () => { setPicked(on ? null : { start: b.start, end: b.end }); setShowAll(false); } : undefined}
                          aria-label={b.changes ? `${plural(b.changes, "change")}, ${shortDay(b.start)}` : undefined}
                          sx={{ flex: "1 1 0", minWidth: 0, p: 0, border: 0, font: "inherit", color: "inherit", borderRadius: "4px", bgcolor: on ? tokens.primaryBg : "transparent", cursor: b.changes ? "pointer" : "default", display: "block", position: "relative", "&:hover": { bgcolor: on ? tokens.primaryBg : tokens.surface2 } }}
                        >
                          <Box sx={{ height: BAR_HEIGHT, display: "flex", alignItems: "flex-end", justifyContent: "center", px: "1px", borderBottom: `1px solid ${tokens.divider}` }}>
                            <Box sx={{ width: "100%", maxWidth: BAR_MAX_WIDTH, height: `${(b.leads / top) * 100}%`, minHeight: b.leads ? 3 : 0, borderRadius: "3px 3px 0 0", bgcolor: tokens.primary }} />
                          </Box>
                          <Box sx={{ height: 30, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {b.changes > 0 && (
                              <Box sx={{ width: small ? 9 : 22, height: small ? 9 : 22, flex: "none", borderRadius: "50%", bgcolor: on ? tokens.primary : tokens.ink, color: tokens.surface, display: "flex", alignItems: "center", justifyContent: "center", fontSize: b.changes > 99 ? 9 : 11.5, fontWeight: 700 }}>
                                {small ? "" : b.changes}
                              </Box>
                            )}
                          </Box>
                          {/* The date, along the bottom. */}
                          <Box sx={{ height: 20, position: "relative" }}>
                            {i % labelEvery === 0 && (
                              <Box component="span" sx={{ position: "absolute", left: "50%", transform: "translateX(-50%)", top: 2, fontSize: 12, fontWeight: 500, color: tokens.ink2, whiteSpace: "nowrap" }}>{shortDay(b.start)}</Box>
                            )}
                          </Box>
                        </Box>
                      </Tooltip>
                    );
                  })}
                </Box>
              </Box>
            </Box>

            <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 0.75, mt: 1.5, mb: 1.25 }}>
              {KINDS.filter((k) => k.key === "key" || counts(k.key) > 0).map((k) => (
                <Chip key={k.key} size="small" label={`${k.label} ${counts(k.key)}`} variant={kind === k.key ? "filled" : "outlined"} color={kind === k.key ? "primary" : "default"} onClick={() => { setKind(k.key); setShowAll(false); }} sx={{ borderRadius: "6px" }} />
              ))}
              {picked && <Chip size="small" label={picked.start === picked.end ? `${shortDay(picked.start)} only` : `${shortDay(picked.start)} to ${shortDay(picked.end)} only`} onDelete={() => setPicked(null)} sx={{ borderRadius: "6px" }} />}
            </Box>

            {!visible.length ? (
              <Typography sx={{ fontSize: 14, color: tokens.ink2 }}>{kind === "key" ? "No targeting, budget, bid or creative changes in these dates." : "No changes like this in these dates."}</Typography>
            ) : (
              shownDays.map(([day, list]) => <DayRow key={day} day={day} items={list} leads={leadMap[day] ?? 0} spent={spendMap ? Number(spendMap[day]) || 0 : null} />)
            )}
            {visible.length > DAYS_SHOWN && (
              <Button size="small" onClick={() => setShowAll((v) => !v)} sx={{ mt: 0.5 }}>{showAll ? "Show fewer" : `Show all ${visible.length} days`}</Button>
            )}
          </>
        )}
      </Box>
    </Box>
  );
}

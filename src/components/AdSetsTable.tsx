import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Box, Button, IconButton, Skeleton, Table, TableBody, TableCell, TableHead, TableRow, TableSortLabel, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from "@mui/material";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { tokens } from "../theme";
import { getAdSetTable, type AdTableRow } from "../api/agentProfile";
import { METRICS, metricValues, sumRows, toneOf, type MetricDef, type Tone } from "../lib/adTargets";
import { timeAgo } from "../lib/timeAgo";

// The client page's "Ad sets & ads", like Ads Manager: one row per ad set
// (or ad) that's on or spent in the dates, each number coloured against the
// media buyer's target (lib/adTargets). Click an ad set to see its ads, with
// a way back. The header and the name column stay put while you scroll.

const TONE_BG: Record<Tone, string | undefined> = { good: "#edf7ee", near: "#fff8e1", bad: "#fdecea", none: undefined };
const money = (n: number) => "R" + Math.round(n).toLocaleString("en-ZA");
const NAME_W = 300;

function fmt(k: MetricDef["key"], v: number | null): string {
  if (v === null) return "—";
  if (k === "spend" || k === "cpl" || k === "cpm") return money(v);
  if (k === "leads") return String(v);
  if (k === "ctr") return v.toFixed(2) + "%";
  if (k === "cvr") return v.toFixed(1) + "%";
  if (k === "freq") return v.toFixed(2);
  return Math.round(v) + "%";
}

const STATUS: Record<string, { label: string; color: string }> = {
  ACTIVE: { label: "Active", color: "#188038" },
  PAUSED: { label: "Off", color: "#9aa0a6" },
  CAMPAIGN_PAUSED: { label: "Campaign off", color: "#9aa0a6" },
  ADSET_PAUSED: { label: "Ad set off", color: "#9aa0a6" },
};

const started = (iso: string) => `Started ${new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })} (${timeAgo(iso)})`;
const adsManagerAd = (account: string, adId: string) =>
  `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${account.replace(/^act_/, "")}&selected_ad_ids=${adId}`;

export default function AdSetsTable({ adAccountId, since, until }: { adAccountId: string | null; since: string; until: string }) {
  const [level, setLevel] = useState<"adset" | "ad">("adset");
  // The ad set whose ads are showing (clicked in the ad sets list).
  const [inSet, setInSet] = useState<{ id: string; name: string } | null>(null);
  const [sort, setSort] = useState<{ k: MetricDef["key"] | "name"; dir: 1 | -1 }>({ k: "spend", dir: -1 });
  const { data, isLoading, isError } = useQuery({
    queryKey: ["adSetTable", adAccountId, level, since, until],
    queryFn: () => getAdSetTable(adAccountId!, since, until, level),
    enabled: !!adAccountId,
    staleTime: 10 * 60_000,
    retry: false,
  });

  const openSet = (r: AdTableRow) => { setInSet({ id: r.id, name: r.name }); setLevel("ad"); };
  const backToSets = () => { setInSet(null); setLevel("adset"); };

  const all = data?.rows ?? [];
  // Ads in the chosen ad set (by id; by name until the function sends ids).
  const scoped = level === "ad" && inSet ? all.filter((r) => (r.adsetId ? r.adsetId === inSet.id : r.adset === inSet.name)) : all;
  const rows = scoped.map((r) => ({ r, v: metricValues(r) }));
  rows.sort((a, b) => {
    if (sort.k === "name") return a.r.name.localeCompare(b.r.name) * sort.dir;
    return ((a.v[sort.k] ?? -Infinity) - (b.v[sort.k] ?? -Infinity)) * sort.dir;
  });
  const totalV = metricValues(sumRows(rows.map((x) => x.r)));
  const what = level === "adset" ? "ad set" : "ad";
  const onSort = (k: MetricDef["key"] | "name") => setSort((s) => (s.k === k ? { k, dir: (s.dir * -1) as 1 | -1 } : { k, dir: k === "name" ? 1 : -1 }));

  // The name column stays on the left while the numbers scroll sideways.
  const stickyName = { position: "sticky", left: 0, zIndex: 1, bgcolor: "background.paper", minWidth: NAME_W, maxWidth: NAME_W, borderRight: `1px solid ${tokens.divider2}` } as const;
  const head = { fontSize: 12, fontWeight: 600, color: tokens.ink2, whiteSpace: "nowrap", bgcolor: tokens.surface2, py: 1 } as const;

  return (
    <Box sx={{ bgcolor: "background.paper", border: `1px solid ${tokens.divider}`, borderRadius: "8px", overflow: "hidden" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, p: "10px 16px", borderBottom: `1px solid ${tokens.divider}`, flexWrap: "wrap", minHeight: 56 }}>
        {inSet ? (
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mr: "auto", minWidth: 0 }}>
            <Button size="small" startIcon={<ArrowBackIcon />} onClick={backToSets} sx={{ textTransform: "none", flex: "none" }}>All ad sets</Button>
            <ChevronRightIcon sx={{ fontSize: 18, color: tokens.ink3, flex: "none" }} />
            <Typography noWrap sx={{ fontSize: 15, fontWeight: 600, minWidth: 0 }} title={inSet.name}>{inSet.name}</Typography>
          </Box>
        ) : (
          <Typography sx={{ fontSize: 15, fontWeight: 600, mr: "auto" }}>Ad sets &amp; ads</Typography>
        )}
        <ToggleButtonGroup
          size="small"
          exclusive
          value={level}
          onChange={(_e, v) => { if (!v) return; setLevel(v); if (v === "adset") setInSet(null); }}
          sx={{ "& .MuiToggleButton-root": { textTransform: "none", fontSize: 13, px: 1.5, py: 0.5 } }}
        >
          <ToggleButton value="adset">Ad sets</ToggleButton>
          <ToggleButton value="ad">{inSet ? "Ads in this set" : "All ads"}</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {!adAccountId ? (
        <Typography sx={{ p: 2, fontSize: 14, color: tokens.ink2 }}>No ad account linked. Add it under Settings → Ads &amp; Facebook.</Typography>
      ) : isLoading ? (
        <Box sx={{ p: 2 }}>{[0, 1, 2].map((i) => <Skeleton key={i} height={52} />)}</Box>
      ) : isError || data?.note ? (
        <Typography sx={{ p: 2, fontSize: 14, color: tokens.ink2 }}>
          {isError ? "Couldn't load the ad sets. Try again in a minute." : data?.note === "busy" ? "Facebook is busy right now. Try again in a few minutes." : "Couldn't read this ad account from Meta. Check it's shared with EstateKit."}
        </Typography>
      ) : !rows.length ? (
        <Typography sx={{ p: 2, fontSize: 14, color: tokens.ink2 }}>{inSet ? "No ads in this ad set ran in these dates." : `No ${what}s ran in these dates.`}</Typography>
      ) : (
        <>
          <Box sx={{ overflow: "auto", maxHeight: 620 }}>
            <Table size="small" stickyHeader sx={{ minWidth: 1100, "& td, & th": { borderColor: tokens.divider2 } }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ ...head, ...stickyName, bgcolor: tokens.surface2, zIndex: 3 }}>
                    <TableSortLabel active={sort.k === "name"} direction={sort.dir === 1 ? "asc" : "desc"} onClick={() => onSort("name")}>{level === "adset" ? "Ad set" : "Ad"}</TableSortLabel>
                  </TableCell>
                  {METRICS.map((m) => (
                    <TableCell key={m.key} align="right" sx={head}>
                      <TableSortLabel active={sort.k === m.key} direction={sort.dir === 1 ? "asc" : "desc"} onClick={() => onSort(m.key)}>
                        <Box sx={{ textAlign: "right" }}>
                          {m.label}
                          {m.target && <Box sx={{ fontSize: 11, fontWeight: 400, color: tokens.ink3 }}>{m.target}</Box>}
                        </Box>
                      </TableSortLabel>
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map(({ r, v }) => {
                  const st = STATUS[r.status] ?? { label: r.status.toLowerCase(), color: "#9aa0a6" };
                  const clickable = level === "adset";
                  return (
                    <TableRow
                      key={r.id}
                      hover
                      tabIndex={clickable ? 0 : undefined}
                      onClick={clickable ? () => openSet(r) : undefined}
                      onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openSet(r); } } : undefined}
                      aria-label={clickable ? `Show the ads in ${r.name}` : undefined}
                      sx={{
                        cursor: clickable ? "pointer" : "default",
                        // Hover darkens every cell, coloured ones too.
                        "&:hover > td": { boxShadow: "inset 0 0 0 9999px rgba(0,0,0,0.035)" },
                        "&:focus-visible": { outline: `2px solid ${tokens.primary}`, outlineOffset: -2 },
                        "&:hover .ek-go, &:focus-visible .ek-go": { opacity: 1, transform: "translateX(2px)" },
                        "&:hover .ek-ext": { opacity: 1 },
                      }}
                    >
                      <TableCell sx={{ ...stickyName, py: 1.25 }}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                          <Box sx={{ minWidth: 0, flex: 1 }}>
                            <Typography sx={{ fontSize: 13.5, fontWeight: 500, color: clickable ? tokens.primary : tokens.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.name}>{r.name}</Typography>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, fontSize: 12, color: tokens.ink2, minWidth: 0 }}>
                              <Box component="span" sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: st.color, flex: "none" }} />
                              <span>{st.label}</span>
                              {r.adset && !inSet && <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>· {r.adset}</Box>}
                            </Box>
                            {r.created && <Typography sx={{ fontSize: 12, color: tokens.ink3 }}>{started(r.created)}</Typography>}
                          </Box>
                          {clickable ? (
                            <ChevronRightIcon className="ek-go" sx={{ color: tokens.ink3, opacity: 0.5, transition: "opacity .12s, transform .12s", flex: "none" }} />
                          ) : adAccountId && (
                            <Tooltip title="Open this ad in Ads Manager">
                              <IconButton
                                className="ek-ext"
                                size="small"
                                component="a"
                                href={adsManagerAd(adAccountId, r.id)}
                                target="_blank"
                                rel="noopener"
                                aria-label={`Open ${r.name} in Ads Manager`}
                                sx={{ opacity: 0.4, transition: "opacity .12s", flex: "none", "&:focus-visible": { opacity: 1 } }}
                              >
                                <OpenInNewIcon sx={{ fontSize: 16 }} />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Box>
                      </TableCell>
                      {METRICS.map((m) => (
                        <TableCell key={m.key} align="right" sx={{ fontVariantNumeric: "tabular-nums", fontSize: 13.5, bgcolor: TONE_BG[toneOf(m, v[m.key], r)] }}>
                          {fmt(m.key, v[m.key])}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })}
                {/* Totals stay at the bottom while the rows scroll. */}
                <TableRow sx={{ position: "sticky", bottom: 0, zIndex: 2, "& td": { bgcolor: tokens.surface2, fontWeight: 600, fontSize: 13.5, borderTop: `2px solid ${tokens.divider}` } }}>
                  <TableCell sx={{ ...stickyName, bgcolor: `${tokens.surface2} !important`, zIndex: 3 }}>Results from {rows.length} {what}{rows.length === 1 ? "" : "s"}</TableCell>
                  {METRICS.map((m) => (
                    <TableCell key={m.key} align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>{fmt(m.key, totalV[m.key])}</TableCell>
                  ))}
                </TableRow>
              </TableBody>
            </Table>
          </Box>
          <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center", p: "10px 16px", fontSize: 12, color: tokens.ink2, borderTop: `1px solid ${tokens.divider}` }}>
            {(["good", "near", "bad"] as const).map((t) => (
              <Box key={t} sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                <Box sx={{ width: 14, height: 14, bgcolor: TONE_BG[t], border: `1px solid ${tokens.divider}` }} />
                {t === "good" ? "On target" : t === "near" ? "Close (within 20%)" : "Off target"}
              </Box>
            ))}
            <span>No colour: under R150 spend or fewer than 3 leads</span>
            {level === "adset" && <Box component="span" sx={{ ml: "auto", color: tokens.ink3 }}>Click an ad set to see its ads</Box>}
          </Box>
        </>
      )}
    </Box>
  );
}

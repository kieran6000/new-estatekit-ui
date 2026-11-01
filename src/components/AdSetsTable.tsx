import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Box, Skeleton, Table, TableBody, TableCell, TableHead, TableRow, TableSortLabel, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { tokens } from "../theme";
import { getAdSetTable, type AdTableRow } from "../api/agentProfile";
import { METRICS, metricValues, sumRows, toneOf, type MetricDef, type Tone } from "../lib/adTargets";
import { timeAgo } from "../lib/timeAgo";

// The client page's "Ad sets & ads": one row per ad set (or ad) that's on or
// spent in the dates, each number coloured against the media buyer's target
// (lib/adTargets). Like Ads Manager, with the targets on the column heads.

const TONE_BG: Record<Tone, string | undefined> = { good: "#edf7ee", near: "#fff8e1", bad: "#fdecea", none: undefined };
const money = (n: number) => "R" + Math.round(n).toLocaleString("en-ZA");

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

const started = (iso: string) => {
  const d = new Date(iso);
  return `Started ${d.toLocaleDateString("en-ZA", { day: "numeric", month: "short" })} (${timeAgo(iso)})`;
};

export default function AdSetsTable({ adAccountId, since, until }: { adAccountId: string | null; since: string; until: string }) {
  const [level, setLevel] = useState<"adset" | "ad">("adset");
  const [sort, setSort] = useState<{ k: MetricDef["key"] | "name"; dir: 1 | -1 }>({ k: "spend", dir: -1 });
  const { data, isLoading, isError } = useQuery({
    queryKey: ["adSetTable", adAccountId, level, since, until],
    queryFn: () => getAdSetTable(adAccountId!, since, until, level),
    enabled: !!adAccountId,
    staleTime: 10 * 60_000,
    retry: false,
  });

  const rows = (data?.rows ?? []).map((r) => ({ r, v: metricValues(r) }));
  rows.sort((a, b) => {
    if (sort.k === "name") return a.r.name.localeCompare(b.r.name) * sort.dir;
    return ((a.v[sort.k] ?? -Infinity) - (b.v[sort.k] ?? -Infinity)) * sort.dir;
  });
  const total = sumRows(rows.map((x) => x.r));
  const totalV = metricValues(total);
  const what = level === "adset" ? "ad set" : "ad";
  const onSort = (k: MetricDef["key"] | "name") => setSort((s) => (s.k === k ? { k, dir: (s.dir * -1) as 1 | -1 } : { k, dir: k === "name" ? 1 : -1 }));
  const head = { fontSize: 12, fontWeight: 600, color: tokens.ink2, whiteSpace: "nowrap", bgcolor: tokens.surface2, py: 1 } as const;

  return (
    <Box sx={{ bgcolor: "background.paper", border: `1px solid ${tokens.divider}`, borderRadius: "8px", overflow: "hidden" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, p: "10px 16px", borderBottom: `1px solid ${tokens.divider}`, flexWrap: "wrap" }}>
        <Typography sx={{ fontSize: 15, fontWeight: 600, mr: "auto" }}>Ad sets &amp; ads</Typography>
        <ToggleButtonGroup size="small" exclusive value={level} onChange={(_e, v) => v && setLevel(v)} sx={{ "& .MuiToggleButton-root": { textTransform: "none", fontSize: 13, px: 1.5, py: 0.5 } }}>
          <ToggleButton value="adset">Ad sets</ToggleButton>
          <ToggleButton value="ad">Ads</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {!adAccountId ? (
        <Typography sx={{ p: 2, fontSize: 14, color: tokens.ink2 }}>No ad account linked. Add it under Settings → Facebook.</Typography>
      ) : isLoading ? (
        <Box sx={{ p: 2 }}>{[0, 1, 2].map((i) => <Skeleton key={i} height={44} />)}</Box>
      ) : isError || data?.note ? (
        <Typography sx={{ p: 2, fontSize: 14, color: tokens.ink2 }}>
          {isError ? "Couldn't load the ad sets. Try again in a minute." : data?.note === "busy" ? "Facebook is busy right now. Try again in a few minutes." : "Couldn't read this ad account from Meta. Check it's shared with EstateKit."}
        </Typography>
      ) : !rows.length ? (
        <Typography sx={{ p: 2, fontSize: 14, color: tokens.ink2 }}>No {what}s ran in these dates.</Typography>
      ) : (
        <>
          <Box sx={{ overflowX: "auto" }}>
            <Table size="small" sx={{ minWidth: 980, "& td, & th": { borderColor: tokens.divider2 } }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ ...head, minWidth: 220 }}>
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
                  return (
                    <TableRow key={r.id}>
                      <TableCell sx={{ py: 1 }}>
                        <Typography sx={{ fontSize: 13.5, fontWeight: 500, color: tokens.primary }}>{r.name}</Typography>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, fontSize: 12, color: tokens.ink2 }}>
                          <Box component="span" sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: st.color }} />
                          {st.label}
                          {r.adset && <span>· {r.adset}</span>}
                        </Box>
                        {r.created && <Typography sx={{ fontSize: 12, color: tokens.ink3 }}>{started(r.created)}</Typography>}
                      </TableCell>
                      {METRICS.map((m) => (
                        <TableCell key={m.key} align="right" sx={{ fontVariantNumeric: "tabular-nums", fontSize: 13.5, bgcolor: TONE_BG[toneOf(m, v[m.key], r)] }}>
                          {fmt(m.key, v[m.key])}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })}
                <TableRow sx={{ bgcolor: tokens.surface2 }}>
                  <TableCell sx={{ fontWeight: 600, fontSize: 13.5 }}>Results from {rows.length} {what}{rows.length === 1 ? "" : "s"}</TableCell>
                  {METRICS.map((m) => (
                    <TableCell key={m.key} align="right" sx={{ fontWeight: 600, fontVariantNumeric: "tabular-nums", fontSize: 13.5 }}>{fmt(m.key, totalV[m.key])}</TableCell>
                  ))}
                </TableRow>
              </TableBody>
            </Table>
          </Box>
          <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center", p: "10px 16px", fontSize: 12, color: tokens.ink2 }}>
            {(["good", "near", "bad"] as const).map((t) => (
              <Box key={t} sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                <Box sx={{ width: 14, height: 14, bgcolor: TONE_BG[t], border: `1px solid ${tokens.divider}` }} />
                {t === "good" ? "On target" : t === "near" ? "Close (within 20%)" : "Off target"}
              </Box>
            ))}
            <span>No colour: under R150 spend or fewer than 3 leads</span>
          </Box>
        </>
      )}
    </Box>
  );
}

export type { AdTableRow };

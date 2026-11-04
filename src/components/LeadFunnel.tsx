import { useId } from "react";
import { Box, Typography } from "@mui/material";
import { leadFunnel } from "../lib/leadFunnel";
import { timeAgo } from "../lib/timeAgo";
import { tokens } from "../theme";

const COLUMN = 100;
const FLAT = 22;
const MIDDLE = 50;

/** The shape: each step's band, flowing smoothly into the next. */
function funnelPath(counts: number[]): string {
  const biggest = Math.max(...counts, 1);
  const half = (n: number) => Math.max(2.5, (n / biggest) * 46);
  const stops = counts.map((n, i) => ({ start: i * COLUMN + FLAT, end: (i + 1) * COLUMN - FLAT, top: MIDDLE - half(n), bottom: MIDDLE + half(n) }));
  const last = stops[stops.length - 1];
  const along = stops.map((s, i) => {
    const next = stops[i + 1];
    return `L ${s.end} ${s.top}` + (next ? ` C ${s.end + FLAT} ${s.top}, ${next.start - FLAT} ${next.top}, ${next.start} ${next.top}` : "");
  }).join(" ");
  const back = [...stops].reverse().map((s, i, all) => {
    const prev = all[i + 1];
    return `L ${s.start} ${s.bottom}` + (prev ? ` C ${s.start - FLAT} ${s.bottom}, ${prev.end + FLAT} ${prev.bottom}, ${prev.end} ${prev.bottom}` : "");
  }).join(" ");
  const width = counts.length * COLUMN;
  return `M 0 ${stops[0].top} ${along} L ${width} ${last.top} L ${width} ${last.bottom} ${back} L 0 ${stops[0].bottom} Z`;
}

/** How far their leads have got, as one shape that narrows from left to right. */
export default function LeadFunnel({ byStage, lastLeadAt }: { byStage: Record<string, number>; lastLeadAt?: string | null }) {
  const gradient = useId();
  const { steps, rest } = leadFunnel(byStage);
  const total = steps[0].count;
  return (
    <Box sx={{ bgcolor: "background.paper", border: `1px solid ${tokens.divider}`, borderRadius: "8px", overflow: "hidden", minWidth: 0 }}>
      <Box sx={{ px: 2, pt: 1.5, pb: 1, minHeight: 44, display: "flex", alignItems: "center", gap: 1 }}>
        <Typography sx={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: tokens.ink2, flex: 1 }}>How far their leads have got</Typography>
        <Typography sx={{ fontSize: 11.5, color: tokens.ink3 }}>All time{lastLeadAt ? ` · last lead ${timeAgo(lastLeadAt)}` : ""}</Typography>
      </Box>
      <Box sx={{ px: 2, pb: 2 }}>
        {!total ? (
          <Typography sx={{ fontSize: 14, color: tokens.ink2 }}>No leads yet.</Typography>
        ) : (
          <>
            <Box sx={{ display: "grid", gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
              {steps.map((s) => (
                <Box key={s.label} sx={{ textAlign: "center", minWidth: 0 }}>
                  <Typography sx={{ fontSize: { xs: 24, sm: 30 }, fontWeight: 600, lineHeight: 1.15, fontVariantNumeric: "tabular-nums" }}>{s.count}</Typography>
                  <Typography sx={{ fontSize: 13.5, fontWeight: 500 }}>{s.label}</Typography>
                </Box>
              ))}
            </Box>
            <Box component="svg" viewBox={`0 0 ${steps.length * COLUMN} 100`} preserveAspectRatio="none" role="img" aria-label={steps.map((s) => `${s.label}: ${s.count}`).join(", ")} sx={{ display: "block", width: "100%", height: { xs: 72, sm: 96 }, my: 1 }}>
              <defs>
                <linearGradient id={gradient} x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0%" style={{ stopColor: tokens.primary, stopOpacity: 0.95 }} />
                  <stop offset="100%" style={{ stopColor: tokens.primary, stopOpacity: 0.45 }} />
                </linearGradient>
              </defs>
              <path d={funnelPath(steps.map((s) => s.count))} fill={`url(#${gradient})`} />
            </Box>
            <Box sx={{ display: "grid", gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
              {steps.map((s, i) => (
                <Typography key={s.label} sx={{ textAlign: "center", fontSize: 12.5, color: tokens.ink2 }}>
                  {i === 0 ? "" : `${Math.round((s.count / total) * 100)}% of leads`}
                </Typography>
              ))}
            </Box>
            {rest.length > 0 && (
              <Typography sx={{ fontSize: 13, color: tokens.ink2, mt: 1.5, pt: 1.25, borderTop: `1px solid ${tokens.divider2}` }}>
                The rest: {rest.map((s) => `${s.label} ${s.count}`).join(" · ")}
              </Typography>
            )}
          </>
        )}
      </Box>
    </Box>
  );
}

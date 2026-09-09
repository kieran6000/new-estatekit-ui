import { Box, Typography } from "@mui/material";
import type { Stage } from "../types";
import { tokens } from "../theme";

/** A stage's dot/segment colour — chosen so the meaning reads at a glance
 *  (green = progressing, amber = waiting, red = dead) and matches the rest of
 *  the app's stage colouring. */
const STAGE_COLOR: Record<Stage, string> = {
  "New Lead": "#1e8e3e",
  "No Answer": "#f29900",
  Contacted: "#1a73e8",
  Booked: "#00897b",
  "Mandate Signed": "#6a1b9a",
  "Viewing Booked": "#00897b",
  "Offer Made": "#6a1b9a",
  Bought: "#2e7d32",
  Lost: "#d93025",
  "Invalid Number": "#9aa0a6",
};

/** Zero-dependency donut: a single SVG circle per segment, drawn with
 *  stroke-dasharray. Keeps the bundle lean and the look plain. */
export default function StageDonut({
  counts,
  title = "Where your leads are",
}: {
  counts: { stage: Stage; count: number }[];
  title?: string;
}) {
  const segments = counts.filter((c) => c.count > 0);
  const total = segments.reduce((s, c) => s + c.count, 0);

  if (total === 0) {
    return (
      <Box sx={{ p: "16px", textAlign: "center", color: "text.secondary" }}>
        <Typography sx={{ fontSize: 13.5 }}>No leads to chart yet.</Typography>
      </Box>
    );
  }

  // Circumference of an r=15.9155 circle is ~100, so each segment's dash length
  // is simply its percentage. Offsets accumulate; we start at 12 o'clock.
  let offset = 25; // rotate so the first segment begins at the top
  const arcs = segments.map((c) => {
    const pct = (c.count / total) * 100;
    const dash = { color: STAGE_COLOR[c.stage], pct, offset };
    offset -= pct;
    return dash;
  });

  return (
    <Box
      sx={{
        display: "flex", alignItems: "center", gap: 1.5,
        p: "8px 12px", bgcolor: "background.paper",
        border: `1px solid ${tokens.divider}`, borderRadius: "8px",
      }}
    >
      <Box sx={{ position: "relative", width: 56, height: 56, flex: "0 0 auto" }}>
        <Box component="svg" viewBox="0 0 42 42" sx={{ width: "100%", height: "100%" }}>
          <circle cx="21" cy="21" r="15.9155" fill="none" stroke={tokens.divider2} strokeWidth="6" />
          {arcs.map((a, i) => (
            <circle
              key={i}
              cx="21"
              cy="21"
              r="15.9155"
              fill="none"
              stroke={a.color}
              strokeWidth="6"
              strokeDasharray={`${a.pct} ${100 - a.pct}`}
              strokeDashoffset={a.offset}
            />
          ))}
        </Box>
        <Box sx={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Typography sx={{ fontSize: 13, fontWeight: 700, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{total}</Typography>
        </Box>
      </Box>

      <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 0.25 }}>
        <Typography sx={{ fontSize: 10, fontWeight: 600, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          {title}
        </Typography>
        <Box sx={{ display: "flex", flexWrap: "wrap", rowGap: "2px", columnGap: "10px" }}>
          {segments.map((c) => {
            const pct = Math.round((c.count / total) * 100);
            return (
              <Box key={c.stage} sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <Box sx={{ width: 8, height: 8, borderRadius: "2px", bgcolor: STAGE_COLOR[c.stage], flex: "0 0 auto" }} />
                <Typography sx={{ fontSize: 11.5, whiteSpace: "nowrap" }}>
                  {c.stage} <Box component="span" sx={{ color: "text.secondary" }}>{c.count} · {pct}%</Box>
                </Typography>
              </Box>
            );
          })}
        </Box>
      </Box>
    </Box>
  );
}

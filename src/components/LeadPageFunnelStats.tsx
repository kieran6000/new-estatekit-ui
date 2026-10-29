import { useQuery } from "@tanstack/react-query";
import { Box, Skeleton, Typography } from "@mui/material";
import { tokens } from "../theme";
import { getFbFormCounts, getLeadPageCounts } from "../api/leadPages";
import { ALL_RANGES, resolveRange, useDateRange } from "../lib/range";
import RangePicker from "./RangePicker";
import InfoTip from "./InfoTip";

// How one website form is doing (Forms → Tracking, staff only): only the
// numbers that say what to change. Each step counts once per visitor;
// people signed in to EstateKit (agents, staff) aren't counted.

const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);
const n = (v: number) => v.toLocaleString("en-ZA");

export default function LeadPageFunnelStats({ pageId, active = true, fb = false }: { pageId: string; active?: boolean; fb?: boolean }) {
  const [range, setRange] = useDateRange("ek_form_stats_range", { key: "30d" });
  const { since, until } = resolveRange(range);
  const { data: c0, isLoading: l0, isError: e0 } = useQuery({
    queryKey: ["leadPageCounts", pageId, since.toISOString(), until.toISOString()],
    queryFn: () => getLeadPageCounts(pageId, since, until),
    enabled: active && !fb,
    staleTime: 60_000,
  });
  const { data: f, isLoading: l1, isError: e1 } = useQuery({
    queryKey: ["fbFormCounts", pageId, since.toISOString(), until.toISOString()],
    queryFn: () => getFbFormCounts(pageId, since, until),
    enabled: active && fb,
    staleTime: 60_000,
  });
  const c = fb ? (f ? { views: 0, starts: 0, contacts: 0, disqualified: 0, submits: f.leads } : undefined) : c0;
  const isLoading = fb ? l1 : l0;
  const isError = fb ? e1 : e0;

  const tiles = fb && f
    ? [
        { label: "Leads", value: n(f.leads), sub: "from this instant form" },
        {
          label: "Tapped the end screen", value: n(f.endScreen), sub: f.leads ? `${pct(f.endScreen, f.leads)}% of leads` : "after sending the form",
          tip: "People who finished the form and tapped its end-screen button, landing on your thank-you page. Low? Check the button's link is set in Facebook.",
        },
        {
          label: "Picked a call time", value: n(f.callTimes), sub: f.leads ? `${pct(f.callTimes, f.leads)}% of leads` : "on the thank-you page",
          tip: "Needs 'Ask when suits them for a call' on. Their lead can arrive up to 15 minutes after they send the form.",
        },
      ]
    : c
    ? [
        { label: "Visitors", value: n(c.views), sub: "opened the form" },
        {
          label: "Started the form", value: `${pct(c.starts, c.views)}%`, sub: `${n(c.starts)} of ${n(c.views)} visitors`,
          tip: "Low? The first screen isn't grabbing them. Try a stronger headline, or a first question that's quick to answer.",
        },
        {
          label: "Finished the form", value: `${pct(c.submits, c.starts)}%`, sub: `${n(c.submits)} of ${n(c.starts)} who started`,
          tip: "Low? The questions lose them. Try fewer questions, or easier ones (choices instead of typing).",
        },
        { label: "Leads", value: n(c.submits), sub: `${pct(c.submits, c.views)}% of visitors` },
        {
          label: "Turned away", value: n(c.disqualified), sub: "by an answer",
          tip: "Picked an answer you set to end the form (e.g. not planning to sell). High? Your ad may be reaching the wrong people.",
        },
      ]
    : [];

  return (
    <Box sx={{ border: `1px solid ${tokens.divider}`, borderRadius: "8px", bgcolor: "background.paper", p: 2, display: "flex", flexDirection: "column", gap: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, flexWrap: "wrap" }}>
        <Typography sx={{ fontSize: 12, fontWeight: 500, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.06em" }}>How this form is doing</Typography>
        <RangePicker value={range} onChange={setRange} options={ALL_RANGES} />
      </Box>

      {isError ? (
        <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Couldn't load the numbers. Try again in a minute.</Typography>
      ) : isLoading || !c ? (
        <Skeleton variant="rounded" height={84} sx={{ borderRadius: "8px" }} />
      ) : (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", md: fb ? "repeat(3, 1fr)" : "repeat(5, 1fr)" }, gap: 1.5 }}>
          {tiles.map((t) => (
            <Box key={t.label} sx={{ border: `1px solid ${tokens.divider2}`, borderRadius: "8px", p: "10px 12px", minWidth: 0 }}>
              <Typography sx={{ fontSize: 22, fontWeight: 600, lineHeight: 1.2 }}>{t.value}</Typography>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.25, mt: 0.25 }}>
                <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{t.label}</Typography>
                {t.tip && <InfoTip>{t.tip}</InfoTip>}
              </Box>
              <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{t.sub}</Typography>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

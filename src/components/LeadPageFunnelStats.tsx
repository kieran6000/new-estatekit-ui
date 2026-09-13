import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Box, Skeleton, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { tokens } from "../theme";
import { getLeadPageFunnel } from "../api/leadPages";

// Admin-only funnel numbers for one landing page, shown above its live preview.
// All counts are unique visitors; signed-in users (agents, admins) aren't counted.

type Period = "7" | "30" | "all";

function pct(part: number, whole: number): string {
  return whole ? `${Math.round((part / whole) * 100)}%` : "—";
}

export default function LeadPageFunnelStats({ pageId }: { pageId: string }) {
  const [period, setPeriod] = useState<Period>("30");
  const since = period === "all" ? null : new Date(Date.now() - Number(period) * 86_400_000).toISOString();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["leadPageFunnel", pageId, period],
    queryFn: () => getLeadPageFunnel(pageId, since),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const tiles = data
    ? [
        { label: "Views", value: String(data.views), sub: "unique visitors" },
        { label: "Started", value: String(data.starts), sub: `${pct(data.starts, data.views)} of views` },
        { label: "Reached contact", value: String(data.contacts), sub: `${pct(data.contacts, data.starts)} of starts` },
        { label: "Opt-ins", value: String(data.submits), sub: `${pct(data.submits, data.contacts)} of contact step` },
        { label: "Opt-in rate", value: pct(data.submits, data.views), sub: "of views" },
        { label: "Disqualified", value: String(data.disqualified), sub: `${pct(data.disqualified, data.starts)} of starts` },
      ]
    : [];

  return (
    <Box sx={{ mb: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
        <Typography sx={{ fontSize: 11, fontWeight: 600, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Page performance
        </Typography>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={period}
          onChange={(_e, v) => v && setPeriod(v)}
          sx={{ "& .MuiToggleButton-root": { textTransform: "none", fontSize: 12, px: 1, py: 0.25 } }}
        >
          <ToggleButton value="7">7 days</ToggleButton>
          <ToggleButton value="30">30 days</ToggleButton>
          <ToggleButton value="all">All</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {isError ? (
        <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Couldn't load page stats.</Typography>
      ) : (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(3, 1fr)" }, gap: 1 }}>
          {isLoading
            ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} variant="rounded" height={64} sx={{ borderRadius: "6px" }} />)
            : tiles.map((t) => (
                <Box key={t.label} sx={{ p: "8px 10px", border: `1px solid ${tokens.divider}`, borderRadius: "6px", bgcolor: "background.paper" }}>
                  <Typography sx={{ fontSize: 11, color: "text.secondary" }}>{t.label}</Typography>
                  <Typography sx={{ fontSize: 20, fontWeight: 600, lineHeight: 1.3, fontVariantNumeric: "tabular-nums" }}>{t.value}</Typography>
                  <Typography sx={{ fontSize: 11, color: "text.disabled" }}>{t.sub}</Typography>
                </Box>
              ))}
        </Box>
      )}
    </Box>
  );
}

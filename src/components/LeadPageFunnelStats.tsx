import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Box, MenuItem, Select, Skeleton, Typography } from "@mui/material";
import { tokens } from "../theme";
import { getLeadPageFunnel } from "../api/leadPages";

// Admin-only funnel numbers for one landing page — one compact row, read left
// to right in funnel order. Counts are unique visitors; signed-in users
// (agents, admins) aren't counted.

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

  const cells = data
    ? [
        { label: "Views", value: String(data.views), rate: "", hint: "Unique visitors" },
        { label: "Started", value: String(data.starts), rate: pct(data.starts, data.views), hint: "of views" },
        { label: "Contact", value: String(data.contacts), rate: pct(data.contacts, data.starts), hint: "of those who started" },
        { label: "Opt-ins", value: String(data.submits), rate: pct(data.submits, data.contacts), hint: "of those at the contact step" },
        { label: "Opt-in rate", value: pct(data.submits, data.views), rate: "", hint: "Opt-ins ÷ views" },
        { label: "Disqualified", value: String(data.disqualified), rate: pct(data.disqualified, data.starts), hint: "of those who started" },
      ]
    : [];

  return (
    <Box sx={{ border: `1px solid ${tokens.divider}`, borderRadius: "8px", bgcolor: "background.paper", p: "10px 16px 12px" }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 0.5 }}>
        <Typography sx={{ fontSize: 12, fontWeight: 500, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Page performance
        </Typography>
        <Select
          variant="standard"
          disableUnderline
          value={period}
          onChange={(e) => setPeriod(e.target.value as Period)}
          sx={{ fontSize: 12.5, color: "text.secondary", "& .MuiSelect-select": { py: 0 } }}
        >
          <MenuItem value="7">Last 7 days</MenuItem>
          <MenuItem value="30">Last 30 days</MenuItem>
          <MenuItem value="all">All time</MenuItem>
        </Select>
      </Box>

      {isError ? (
        <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Couldn't load page stats.</Typography>
      ) : isLoading ? (
        <Skeleton variant="rounded" height={40} sx={{ borderRadius: "4px" }} />
      ) : (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(3, 1fr)", sm: "repeat(6, 1fr)" }, rowGap: 1 }}>
          {cells.map((c, i) => (
            <Box
              key={c.label}
              title={c.rate ? `${c.rate} ${c.hint}` : c.hint}
              sx={{ pl: i ? 1.25 : 0, borderLeft: i ? `1px solid ${tokens.divider2}` : 0, minWidth: 0 }}
            >
              <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.5 }}>
                <Typography sx={{ fontSize: 17, fontWeight: 600, lineHeight: 1.3, fontVariantNumeric: "tabular-nums" }}>{c.value}</Typography>
                {c.rate && <Typography sx={{ fontSize: 11, color: "text.disabled" }}>{c.rate}</Typography>}
              </Box>
              <Typography sx={{ fontSize: 11, color: "text.secondary", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {c.label}
              </Typography>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

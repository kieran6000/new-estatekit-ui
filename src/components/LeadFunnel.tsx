import { Box, Typography } from "@mui/material";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { leadFunnel } from "../lib/leadFunnel";
import { timeAgo } from "../lib/timeAgo";
import { tokens } from "../theme";

/** How far their leads have got, on one slim row. */
export default function LeadFunnel({ byStage, lastLeadAt }: { byStage: Record<string, number>; lastLeadAt?: string | null }) {
  const { steps, rest } = leadFunnel(byStage);
  const total = steps[0].count;
  return (
    <Box sx={{ bgcolor: "background.paper", border: `1px solid ${tokens.divider}`, borderRadius: "8px", px: 2, py: 1.25, minWidth: 0 }}>
      {!total ? (
        <Typography sx={{ fontSize: 14, color: tokens.ink2 }}>No leads yet.</Typography>
      ) : (
        <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", columnGap: 2, rowGap: 0.75 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: { xs: 0.25, sm: 1 }, flex: "1 1 420px", minWidth: 0 }}>
            {steps.map((s, i) => (
              <Box key={s.label} sx={{ display: "contents" }}>
                {i > 0 && <ChevronRightIcon sx={{ fontSize: 20, color: tokens.ink3, flex: "none" }} />}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", columnGap: 0.75 }}>
                    <Typography sx={{ fontSize: 22, fontWeight: 600, lineHeight: 1.2, fontVariantNumeric: "tabular-nums" }}>{s.count}</Typography>
                    <Typography sx={{ fontSize: 13, fontWeight: 500 }}>{s.label}</Typography>
                  </Box>
                  <Box sx={{ height: 4, mt: 0.5, borderRadius: "2px", bgcolor: tokens.surface2, overflow: "hidden" }}>
                    <Box sx={{ height: "100%", width: `${(s.count / total) * 100}%`, bgcolor: tokens.primary, borderRadius: "2px" }} />
                  </Box>
                </Box>
              </Box>
            ))}
          </Box>
          <Box sx={{ flex: "0 1 auto", minWidth: 0 }}>
            {rest.length > 0 && <Typography sx={{ fontSize: 12.5, color: tokens.ink2 }}>{rest.map((s) => `${s.label} ${s.count}`).join(" · ")}</Typography>}
            <Typography sx={{ fontSize: 12, color: tokens.ink3 }}>All time{lastLeadAt ? ` · last lead ${timeAgo(lastLeadAt)}` : ""}</Typography>
          </Box>
        </Box>
      )}
    </Box>
  );
}

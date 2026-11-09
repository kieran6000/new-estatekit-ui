import { Box, Tooltip, Typography } from "@mui/material";
import { stageCounts } from "../lib/leadFunnel";
import { timeAgo } from "../lib/timeAgo";
import { tokens } from "../theme";

/** The same colours as the stage chips on a lead. */
const STAGE_COLOR: Record<string, string> = {
  "New Lead": tokens.green,
  "No Answer": tokens.amber,
  Contacted: tokens.primary,
  Booked: tokens.purple,
  "Viewing Booked": tokens.purple,
  "Offer Made": tokens.greenDark,
  "Mandate Signed": tokens.greenDark,
  Bought: tokens.greenDark,
  Lost: tokens.ink3,
  "Invalid Number": tokens.ink3,
};
const colorOf = (stage: string) => STAGE_COLOR[stage] ?? tokens.ink3;

/** Where their leads are right now, by the pipeline's own stage names, on one slim row. */
export default function LeadFunnel({ byStage, lastLeadAt, hasAdAccount = true }: { byStage: Record<string, number>; lastLeadAt?: string | null; hasAdAccount?: boolean }) {
  const { total, stages } = stageCounts(byStage);
  return (
    <Box sx={{ bgcolor: "background.paper", border: `1px solid ${tokens.divider}`, borderRadius: "8px", px: 2, py: 1.5, minWidth: 0 }}>
      {!total ? (
        <Typography sx={{ fontSize: 14, color: tokens.ink2 }}>{hasAdAccount ? "No leads yet. Leads from their Facebook ads show here within about 5 minutes of coming in." : "No leads yet. Once their ad account is linked above and their ads run, leads show here."}</Typography>
      ) : (
        <>
          <Box sx={{ display: "flex", alignItems: "flex-end", flexWrap: "wrap", columnGap: 3, rowGap: 1 }}>
            <Box>
              <Typography sx={{ fontSize: 26, fontWeight: 700, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>{total}</Typography>
              <Typography sx={{ fontSize: 13, color: tokens.ink2 }}>leads</Typography>
            </Box>
            {stages.map((s) => (
              <Box key={s.stage}>
                <Typography sx={{ fontSize: 18, fontWeight: 600, lineHeight: 1.2, fontVariantNumeric: "tabular-nums" }}>{s.count}</Typography>
                <Typography sx={{ fontSize: 13, color: tokens.ink2, display: "flex", alignItems: "center", gap: 0.6, whiteSpace: "nowrap" }}>
                  <Box component="span" sx={{ width: 8, height: 8, borderRadius: "2px", bgcolor: colorOf(s.stage), flex: "none" }} />
                  {s.stage}
                </Typography>
              </Box>
            ))}
            <Typography sx={{ fontSize: 12, color: tokens.ink3, ml: "auto", alignSelf: "flex-end" }}>All time{lastLeadAt ? ` · last lead ${timeAgo(lastLeadAt)}` : ""}</Typography>
          </Box>
          {/* One bar: how their leads split across the stages. */}
          <Box sx={{ display: "flex", gap: "2px", height: 8, mt: 1.25, borderRadius: "4px", overflow: "hidden" }}>
            {stages.map((s) => (
              <Tooltip key={s.stage} title={`${s.stage}: ${s.count} of ${total}`}>
                <Box sx={{ flex: `${s.count} 1 0`, minWidth: 3, bgcolor: colorOf(s.stage) }} />
              </Tooltip>
            ))}
          </Box>
        </>
      )}
    </Box>
  );
}

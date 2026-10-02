import { Box, Tooltip } from "@mui/material";
import { tokens } from "../theme";

// "Not ready yet": the lead's form answers matched one of the page's
// low-quality answers (e.g. "Just curious"), so the page didn't report them
// to Facebook as a lead (lead page → quality "weak"). They still reach the
// agent; the badge says "call, but don't expect a listing this month".
// Good leads get no badge: the exception is labelled, the norm stays clean.

export const NOT_READY_HELP =
  "Their form answers say they're not ready to sell yet (for example \"Just curious\"). Still worth a call to stay top of mind. Facebook wasn't told about this lead, so your ads keep looking for ready sellers.";

export function isNotReady(l: { quality?: string | null }): boolean {
  return l.quality === "weak";
}

export default function NotReadyBadge({ size = "small" }: { size?: "small" | "medium" }) {
  return (
    <Tooltip title={NOT_READY_HELP} enterTouchDelay={0}>
      <Box
        component="span"
        sx={{
          display: "inline-flex",
          alignItems: "center",
          whiteSpace: "nowrap",
          fontSize: size === "small" ? 10.5 : 12,
          fontWeight: 700,
          letterSpacing: ".02em",
          px: size === "small" ? 0.75 : 1,
          py: size === "small" ? "1px" : "2px",
          borderRadius: "999px",
          color: tokens.ink2,
          bgcolor: tokens.surface2,
          border: `1px solid ${tokens.divider}`,
          ml: 0.75,
          verticalAlign: "1px",
          cursor: "help",
        }}
      >
        Not ready yet
      </Box>
    </Tooltip>
  );
}

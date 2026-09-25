import { Box } from "@mui/material";
import { IS_PREVIEW } from "../lib/deployEnv";

/**
 * Shown on every screen of a preview deployment, public lead pages included,
 * so a preview link is never mistaken for the live site or forwarded to a
 * client. Renders nothing in production.
 */
export default function PreviewBanner() {
  if (!IS_PREVIEW) return null;
  return (
    <Box
      role="status"
      sx={{
        bgcolor: "#ffb300",
        color: "#000",
        fontSize: 13,
        fontWeight: 700,
        textAlign: "center",
        px: 2,
        py: 0.75,
        lineHeight: 1.35,
      }}
    >
      PREVIEW - live data. Clients can't see this link.
    </Box>
  );
}

import type { ReactNode } from "react";
import { Box, Typography } from "@mui/material";
import CheckCircleOutlinedIcon from "@mui/icons-material/CheckCircleOutlined";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import { tokens } from "../theme";

/** The one line that says how something's doing: green if fine, amber if not. */
export default function StatusStrip({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, minHeight: 44, px: 1.25, py: 0.75, borderRadius: "8px", bgcolor: ok ? tokens.greenTint : tokens.amberTint, border: `1px solid ${ok ? tokens.greenBorder : tokens.amberBorder}` }}>
      {ok ? <CheckCircleOutlinedIcon sx={{ fontSize: 20, color: tokens.greenDark }} /> : <WarningAmberRoundedIcon sx={{ fontSize: 20, color: "warning.dark" }} />}
      <Typography sx={{ fontSize: 14, fontWeight: 500 }}>{children}</Typography>
    </Box>
  );
}

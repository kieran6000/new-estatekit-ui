import { Box } from "@mui/material";
import type { StatusTone } from "../api/clients";

export const TONE: Record<StatusTone, { fg: string; bg: string }> = {
  red: { fg: "#b71c1c", bg: "#fdecea" },
  amber: { fg: "#8a5300", bg: "#fff4e0" },
  green: { fg: "#1b5e20", bg: "#e8f5e9" },
  blue: { fg: "#0d47a1", bg: "#e8f0fe" },
  grey: { fg: "rgba(0,0,0,.6)", bg: "#eef1f3" },
};

/** Small flat status pill, coloured by tone. Text carries the meaning; colour
 *  only reinforces it. */
export default function ClientStatusChip({ label, tone, size = "sm" }: { label: string; tone: StatusTone; size?: "sm" | "md" }) {
  const t = TONE[tone] ?? TONE.grey;
  return (
    <Box
      component="span"
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.5,
        px: size === "md" ? 1.25 : 0.875,
        py: size === "md" ? 0.375 : 0.125,
        borderRadius: "999px",
        bgcolor: t.bg,
        color: t.fg,
        fontSize: size === "md" ? 12.5 : 11,
        fontWeight: 600,
        whiteSpace: "nowrap",
        lineHeight: 1.6,
      }}
    >
      <Box component="span" sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: t.fg, flexShrink: 0 }} />
      {label}
    </Box>
  );
}

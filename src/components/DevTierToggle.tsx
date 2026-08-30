import { Box, Switch, Typography } from "@mui/material";
import { useTier } from "../hooks/useTier";

/**
 * Demo-only affordance for flipping Free/Paid without a real subscription
 * backend — deliberately styled as a debug overlay, not part of the app's
 * actual UI, so it's exempt from the "don't restyle the app" rule.
 */
export default function DevTierToggle() {
  const { tier, setTier } = useTier();
  const paid = tier === "paid";

  return (
    <Box
      sx={{
        position: "fixed",
        right: 10,
        bottom: { xs: 66, md: 10 },
        zIndex: 1300,
        display: "flex",
        alignItems: "center",
        gap: 0.5,
        bgcolor: "#212121",
        color: "#fff",
        borderRadius: "20px",
        pl: 1.5,
        pr: 0.5,
        py: 0.25,
        boxShadow: "0 2px 8px rgba(0,0,0,.35)",
        fontFamily: "monospace",
      }}
    >
      <Typography sx={{ fontSize: 10, letterSpacing: "0.06em", opacity: 0.7 }}>DEV · TIER</Typography>
      <Typography sx={{ fontSize: 11, fontWeight: 700, minWidth: 34 }}>{paid ? "PAID" : "FREE"}</Typography>
      <Switch size="small" checked={paid} onChange={(e) => setTier(e.target.checked ? "paid" : "free")} />
    </Box>
  );
}

import { Box, Typography } from "@mui/material";
import { usePostHog } from "@posthog/react";
import estateKitLogo from "../assets/blue logo full.png";

export type PoweredByPlacement = "lead_page" | "thank_you";

/** Small footer on clients' public pages that points other agents to a free
 *  EstateKit account. Deliberately quiet on the lead page (it must never pull
 *  a homeowner away from the client's form) and a touch more direct on the
 *  thank-you page, where the visitor has already converted. Opens in a new
 *  tab for the same reason. */
export default function PoweredByEstateKit({ refSlug, placement }: { refSlug?: string | null; placement: PoweredByPlacement }) {
  const posthog = usePostHog();
  const params = new URLSearchParams({ from: placement });
  if (refSlug) params.set("ref", refSlug);
  const href = `/start?${params.toString()}`;

  return (
    <Box
      component="a"
      href={href}
      target="_blank"
      rel="noopener"
      onClick={() => posthog.capture("powered_by_clicked", { placement, ref: refSlug ?? null })}
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 0.5,
        mt: 3,
        mb: 2,
        py: 1,
        textDecoration: "none",
        color: "text.disabled",
        opacity: placement === "lead_page" ? 0.75 : 1,
        transition: "opacity .15s",
        "&:hover": { opacity: 1 },
        "&:hover .ek-cta": { textDecoration: "underline" },
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
        <Typography component="span" sx={{ fontSize: 11, letterSpacing: "0.02em" }}>Powered by</Typography>
        <Box component="img" src={estateKitLogo} alt="EstateKit" sx={{ height: 14, width: "auto", display: "block" }} />
      </Box>
      {placement === "thank_you" && (
        <Typography className="ek-cta" component="span" sx={{ fontSize: 12, color: "text.secondary" }}>
          Estate agent? Get leads like this in your area, free →
        </Typography>
      )}
    </Box>
  );
}

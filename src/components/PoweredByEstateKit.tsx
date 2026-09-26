import { Box, Typography } from "@mui/material";
import { usePostHog } from "@posthog/react";
import estateKitLogo from "../assets/blue logo full.png";

export type PoweredByPlacement = "lead_page" | "thank_you";

/** Small footer badge on clients' public pages that points other agents to a
 *  free EstateKit account. A neat pill rather than loose text, so it reads as
 *  a deliberate badge, and quiet enough never to pull a homeowner away from
 *  the client's form. The thank-you page adds a one-line agent CTA, since the
 *  visitor has already converted there. Opens in a new tab so nobody loses a
 *  half-filled form. */
export default function PoweredByEstateKit({ refSlug, placement }: { refSlug?: string | null; placement: PoweredByPlacement }) {
  const posthog = usePostHog();
  const params = new URLSearchParams({ from: placement });
  if (refSlug) params.set("ref", refSlug);
  const href = `/start?${params.toString()}`;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1, mt: 3, mb: 2 }}>
      <Box
        component="a"
        href={href}
        target="_blank"
        rel="noopener"
        onClick={() => posthog.capture("powered_by_clicked", { placement, ref: refSlug ?? null })}
        sx={{
          display: "inline-flex",
          alignItems: "center",
          gap: 0.875,
          height: 30,
          px: 1.5,
          borderRadius: "999px",
          bgcolor: "#fff",
          border: "1px solid #e3e5e8",
          boxShadow: "0 1px 2px rgba(0,0,0,.05)",
          textDecoration: "none",
          transition: "box-shadow .15s, border-color .15s, transform .15s",
          "&:hover": { borderColor: "#cfd3d8", boxShadow: "0 2px 6px rgba(0,0,0,.08)", transform: "translateY(-1px)" },
        }}
      >
        <Typography component="span" sx={{ fontSize: 11.5, fontWeight: 500, color: "#5f6368", lineHeight: 1 }}>
          Powered by
        </Typography>
        <Box component="img" src={estateKitLogo} alt="EstateKit" sx={{ height: 15, width: "auto", display: "block" }} />
      </Box>

      {placement === "thank_you" && (
        <Box
          component="a"
          href={href}
          target="_blank"
          rel="noopener"
          onClick={() => posthog.capture("powered_by_clicked", { placement, ref: refSlug ?? null, cta: true })}
          sx={{ fontSize: 12.5, color: "#5f6368", textDecoration: "none", "&:hover": { textDecoration: "underline", color: "#1976d2" } }}
        >
          Estate agent? Get leads like this in your area, free →
        </Box>
      )}
    </Box>
  );
}

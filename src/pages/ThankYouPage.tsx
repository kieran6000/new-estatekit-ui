import { useEffect } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Box, Skeleton, Typography } from "@mui/material";
import CallIcon from "@mui/icons-material/Call";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutlined";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import { tokens } from "../theme";
import { getLeadPageBySlug } from "../api/leadPages";
import { listSoldListingsForAgent } from "../api/soldListings";
import { HeaderBrand } from "../components/LeadCaptureForm";
import { SoldList } from "../components/SoldListings";
import PoweredByEstateKit from "../components/PoweredByEstateKit";
import { initPixel } from "../lib/fbPixel";
import { fillMessage } from "../lib/format";
import { readableOn } from "../lib/contrast";
import { isPlanToken, recallPlanToken } from "../lib/planToken";
import { resolveMagnet } from "../lib/leadMagnet";
import type { LeadPage } from "../types";

export default function ThankYouPage() {
  const [params] = useSearchParams();
  const slug = params.get("p");
  const name = params.get("n") || "there";
  // Seller leads: the marketing plan made for them (see lib/planToken). The
  // router state says "none" with null; only with no state at all (opened
  // some other way) is the tab's saved copy used.
  const state = useLocation().state as { planToken?: string | null } | null;
  const planToken = state && "planToken" in state ? (isPlanToken(state.planToken) ? state.planToken : null) : slug ? recallPlanToken(slug) : null;

  const { data: page, isLoading } = useQuery({
    queryKey: ["publicPageSlug", slug],
    queryFn: () => getLeadPageBySlug(slug!),
    enabled: !!slug,
  });

  // Load the agent's pixel here (PageView only). The Lead event is fired once,
  // on submit, by the lead page: it carries the event id the Conversions API
  // shares, and it is skipped for weak leads. Firing Lead here as well counted
  // every lead twice and told Meta weak leads converted.
  useEffect(() => {
    if (page?.fbPixelId) initPixel(page.fbPixelId);
  }, [page?.fbPixelId]);

  if (!slug) return <GenericThankYou />;

  if (isLoading) {
    return (
      <Box sx={{ minHeight: "100vh", bgcolor: tokens.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Skeleton variant="rounded" width={360} height={320} sx={{ borderRadius: "8px" }} />
      </Box>
    );
  }

  if (!page) return <GenericThankYou />;

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: tokens.bg }}>
      <Box sx={{ bgcolor: page.accentColor, color: "#fff", p: "14px 20px", textAlign: "center" }}>
        <HeaderBrand page={page} />
      </Box>

      <Box sx={{ display: "flex", justifyContent: "center", p: 2 }}>
        <Box sx={{ width: "100%", maxWidth: 480, mt: 2.5 }}>
          <Box sx={{ border: "1px solid #e0e0e0", borderRadius: "8px", overflow: "hidden", bgcolor: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.08)" }}>
            <Box sx={{ p: "40px 24px", minHeight: 260, display: "flex", flexDirection: "column" }}>
              <BrandedThankYou page={page} name={name} />
            </Box>
          </Box>
          {planToken && <PlanCard page={page} token={planToken} />}
          <SoldListingsSection agentId={page.agentId} />
          <PoweredByEstateKit refSlug={page.slug} placement="thank_you" />
        </Box>
      </Box>
    </Box>
  );
}

/** The form's lead magnet: the same headline, line and link as the box in
 *  the confirmation email (lib/leadMagnet.ts). Only shown when the lead page
 *  made a code for it, which it does only when the form has one. */
function PlanCard({ page, token }: { page: LeadPage; token: string }) {
  // The page only makes a code when there's a lead magnet, so "not set" here
  // means the automatic one: the marketing plan.
  const m = resolveMagnet(page, "seller");
  if (m.kind === "none") return null;
  return (
    <Box sx={{ mt: 2, border: "1px solid #e0e0e0", borderLeft: `4px solid ${page.accentColor}`, borderRadius: "8px", bgcolor: "#fff", p: "18px 20px" }}>
      <Typography sx={{ fontSize: 17, fontWeight: 700 }}>{m.title}</Typography>
      {m.text && <Typography sx={{ fontSize: 14, color: "text.secondary", mt: 0.5 }}>{m.text}</Typography>}
      <Box
        component="a"
        href={`/plan/${token}?from=thanks`}
        target="_blank"
        rel="noopener"
        sx={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 1, mt: 2,
          bgcolor: page.accentColor, color: readableOn(page.accentColor), borderRadius: "10px", p: "13px 18px",
          fontSize: 16, fontWeight: 700, textDecoration: "none", "&:hover": { filter: "brightness(0.92)" },
        }}
      >
        {m.button} <ArrowForwardIcon fontSize="small" />
      </Box>
    </Box>
  );
}

function SoldListingsSection({ agentId }: { agentId: string }) {
  const { data: listings = [] } = useQuery({
    queryKey: ["publicSold", agentId],
    queryFn: () => listSoldListingsForAgent(agentId),
    enabled: !!agentId,
  });
  if (!listings.length) return null;
  return (
    <Box sx={{ mt: 2 }}>
      <SoldList listings={listings} />
    </Box>
  );
}

function BrandedThankYou({ page, name }: { page: LeadPage; name: string }) {
  const hasPhoto = !!page.profilePhotoDataUrl;
  const size = hasPhoto ? 76 : 96;
  return (
    <Box sx={{ textAlign: "center", m: "auto 0" }}>
      <Box sx={{ position: "relative", width: size, height: size, mx: "auto", mb: 2.5 }}>
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            border: `2px solid ${page.accentColor}`,
            opacity: 0.6,
            animation: "ek-call-ring 1.8s cubic-bezier(0,0,0.2,1) infinite",
            "@keyframes ek-call-ring": {
              "0%": { transform: "scale(0.85)", opacity: 0.6 },
              "100%": { transform: "scale(1.5)", opacity: 0 },
            },
          }}
        />
        {hasPhoto ? (
          <Box sx={{ width: size, height: size, borderRadius: "50%", overflow: "hidden", border: "1px solid #e0e0e0" }}>
            <Box component="img" src={page.profilePhotoDataUrl!} alt="" sx={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </Box>
        ) : (
          <Box
            sx={{
              width: size,
              height: size,
              borderRadius: "50%",
              bgcolor: page.accentColor,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <CallIcon sx={{ fontSize: 40, color: "#fff" }} />
          </Box>
        )}
        {hasPhoto && (
          <Box
            sx={{
              position: "absolute",
              bottom: -2,
              right: -2,
              width: 28,
              height: 28,
              borderRadius: "50%",
              bgcolor: "#2e7d32",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 0 0 3px #fff",
            }}
          >
            <CallIcon sx={{ fontSize: 14 }} />
          </Box>
        )}
      </Box>
      <Typography sx={{ fontSize: 20, fontWeight: 700 }}>{fillMessage(page.thankYouHeadline, name, page.agentName)}</Typography>
      <Typography sx={{ fontSize: 14, color: "text.secondary", mt: 1 }}>{fillMessage(page.thankYouSubtext, name, page.agentName)}</Typography>

      {(() => {
        const digits = (page.phone || "").replace(/\D/g, "");
        if (!digits) return null;
        const msg = `Hi${page.agentName ? " " + page.agentName : ""}, I just filled in your form and I'd love to hear more.`;
        return (
          <Box
            component="a"
            href={`https://wa.me/${digits}?text=${encodeURIComponent(msg)}`}
            target="_blank"
            rel="noopener"
            sx={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 1,
              mt: 3, mx: "auto", maxWidth: 340, bgcolor: "#25D366", color: "#fff",
              borderRadius: "10px", p: "14px 18px", fontSize: 16, fontWeight: 700,
              textDecoration: "none", "&:hover": { bgcolor: "#1FB457" },
            }}
          >
            <WhatsAppIcon /> Message us on WhatsApp
          </Box>
        );
      })()}
    </Box>
  );
}

function GenericThankYou() {
  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: tokens.bg,
        p: 3,
      }}
    >
      <Box sx={{ textAlign: "center", maxWidth: 420 }}>
        <CheckCircleOutlineIcon sx={{ fontSize: 64, color: tokens.green, mb: 2 }} />
        <Typography sx={{ fontSize: 24, fontWeight: 700, mb: 1 }}>Thank you!</Typography>
        <Typography sx={{ fontSize: 15, color: "text.secondary", lineHeight: 1.6 }}>
          Your details have been submitted successfully. One of our agents will
          be in touch with you shortly.
        </Typography>
      </Box>
    </Box>
  );
}

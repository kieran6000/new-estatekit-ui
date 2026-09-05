import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Box, Skeleton, Typography } from "@mui/material";
import CallIcon from "@mui/icons-material/Call";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutlined";
import { tokens } from "../theme";
import { getLeadPageBySlug } from "../api/leadPages";
import { HeaderBrand } from "../components/LeadCaptureForm";
import { initPixel, trackPixel } from "../lib/fbPixel";
import type { LeadPage } from "../types";

export default function ThankYouPage() {
  const [params] = useSearchParams();
  const slug = params.get("p");
  const name = params.get("n") || "there";

  const { data: page, isLoading } = useQuery({
    queryKey: ["publicPageSlug", slug],
    queryFn: () => getLeadPageBySlug(slug!),
    enabled: !!slug,
  });

  // Fire the agent's pixel on the thank-you page too (covers direct hits and
  // gives Meta a clean Lead event on the confirmation view).
  useEffect(() => {
    if (page?.fbPixelId) {
      initPixel(page.fbPixelId);
      trackPixel("Lead");
    }
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
        </Box>
      </Box>
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
      <Typography sx={{ fontSize: 20, fontWeight: 700 }}>{page.thankYouHeadline.replace("{name}", name)}</Typography>
      <Typography sx={{ fontSize: 14, color: "text.secondary", mt: 1 }}>{page.thankYouSubtext}</Typography>
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

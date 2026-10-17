import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Box, Button, CircularProgress, Skeleton, Typography } from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import { tokens } from "../theme";
import { getOnboardingVideo, markOnboardingWatched } from "../api/onboarding";
import VideoPlayer, { canPlayVideo } from "../components/VideoPlayer";
import { ACCENT } from "../components/FunnelSteps";
import estateKitLogoWhite from "../assets/whitelogofull.png";

// After the onboarding form (/onboarding): what happens next. Just the
// headline, the video (staff set it on the Accounts page) and one button.
// The button notes they watched it (the submission's private code, ?t=) and
// takes them to log in with the details we sent.

export default function OnboardingNextPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("t") || "";
  const first = (params.get("n") || "").trim();
  const [busy, setBusy] = useState(false);
  const buttonRef = useRef<HTMLDivElement>(null);
  const { data: url = "", isLoading } = useQuery({ queryKey: ["onboardingVideo"], queryFn: getOnboardingVideo, staleTime: 5 * 60_000 });
  const video = url && canPlayVideo(url) ? url : "";

  useEffect(() => { document.title = "What happens next · EstateKit"; }, []);

  async function done() {
    setBusy(true);
    try {
      if (token) await markOnboardingWatched(token);
    } catch (e) {
      console.error(e);
    }
    navigate("/login");
  }
  const showButton = () => buttonRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: tokens.bg }}>
      <Box sx={{ bgcolor: ACCENT, p: "14px 20px", textAlign: "center" }}>
        <Box component="img" src={estateKitLogoWhite} alt="EstateKit" sx={{ height: 28, width: "auto", display: "inline-block", verticalAlign: "middle" }} />
      </Box>

      <Box sx={{ display: "flex", justifyContent: "center", p: 2 }}>
        <Box sx={{ width: "100%", maxWidth: 560, mt: 2.5 }}>
          <Box sx={{ border: "1px solid #e0e0e0", borderRadius: "8px", bgcolor: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.08)", p: { xs: "28px 20px", sm: "32px 28px" }, textAlign: "center" }}>
            <Typography sx={{ fontSize: { xs: 22, sm: 24 }, fontWeight: 700, lineHeight: 1.3 }}>
              {video || isLoading
                ? <>{first ? `${first}, watch this first:` : "Watch this first:"} what happens next</>
                : <>You&apos;re all set{first ? `, ${first}` : ""}!</>}
            </Typography>

            <Box sx={{ mt: 2.5 }}>
              {isLoading ? (
                <Skeleton variant="rounded" sx={{ width: "100%", height: 0, pt: "56.25%", borderRadius: "10px" }} />
              ) : video ? (
                <VideoPlayer url={video} accent={ACCENT} autoplay endCta={{ label: "I've watched it", onClick: showButton, below: true }} />
              ) : (
                <Typography sx={{ fontSize: 15, color: "text.secondary" }}>
                  Your account is ready. Your login is on your WhatsApp and email.
                </Typography>
              )}
            </Box>

            <Box ref={buttonRef}>
              <Button
                variant="contained"
                size="large"
                fullWidth
                disabled={busy}
                startIcon={busy ? <CircularProgress size={18} sx={{ color: "inherit" }} /> : <CheckIcon />}
                onClick={done}
                sx={{ mt: 3, bgcolor: ACCENT }}
              >
                {video ? "I've watched the video" : "Log in"}
              </Button>
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

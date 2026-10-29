import { useEffect, useRef, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Box, Button, Skeleton, Typography } from "@mui/material";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutlined";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import AutoStoriesOutlinedIcon from "@mui/icons-material/AutoStoriesOutlined";
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
import { resolveMagnet, type Magnet } from "../lib/leadMagnet";
import type { LeadPage } from "../types";
import { getPagePlan } from "../api/pagePlan";
import { ThankYouCallTime } from "../components/ThankYouExtras";
import VideoPlayer, { canPlayVideo, type EndCta, type VideoProgress } from "../components/VideoPlayer";
import { supabase } from "../api/_client";

export default function ThankYouPage() {
  const [params] = useSearchParams();
  const slug = params.get("p");
  // The dashboard's preview (Forms → Thank-you page): everything shows, nothing is saved or tracked.
  const preview = params.get("preview") === "1";
  // No name (e.g. from a Facebook instant form's end button): "Thanks!", not "Thanks there!".
  const nameParam = (params.get("n") || "").trim();
  const name = nameParam.toLowerCase() === "there" ? "" : nameParam;
  // Seller leads: the marketing plan made for them (see lib/planToken). The
  // router state says "none" with null; only with no state at all (opened
  // some other way) is the tab's saved copy used.
  const state = useLocation().state as { planToken?: string | null } | null;
  const planToken = state && "planToken" in state ? (isPlanToken(state.planToken) ? state.planToken : null) : slug ? recallPlanToken(slug) : null;

  // The step after the video (call time, or the lead magnet): the end of the
  // video points to it and brings it into view.
  const nextRef = useRef<HTMLDivElement>(null);
  // Once they've picked a call time, the lead magnet is the next thing to
  // tap: it scrolls into view and its button draws the eye.
  const magnetRef = useRef<HTMLDivElement>(null);
  const [timePicked, setTimePicked] = useState(false);
  useEffect(() => {
    if (timePicked) setTimeout(() => magnetRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 500);
  }, [timePicked]);
  // The furthest point already reported for the video (see onVideoProgress).
  const reported = useRef(0);

  const { data: page, isLoading } = useQuery({
    queryKey: ["publicPageSlug", slug],
    queryFn: () => getLeadPageBySlug(slug!),
    enabled: !!slug,
  });

  // Whether it's a seller form (decides the default lead magnet), and the
  // general plan for people with no personal code (e.g. from a Facebook
  // instant form's end button, where we don't know who they are).
  const { data: pagePlan } = useQuery({
    queryKey: ["pagePlan", slug],
    queryFn: () => getPagePlan(slug!),
    enabled: !!slug,
    staleTime: Infinity,
  });
  // Load the agent's pixel here (PageView only). The Lead event is fired once,
  // on submit, by the lead page: it carries the event id the Conversions API
  // shares, and it is skipped for weak leads. Firing Lead here as well counted
  // every lead twice and told Meta weak leads converted.
  useEffect(() => {
    if (page?.fbPixelId && !preview) initPixel(page.fbPixelId);
  }, [page?.fbPixelId, preview]);

  if (!slug) return <GenericThankYou />;

  if (isLoading) {
    return (
      <Box sx={{ minHeight: "100vh", bgcolor: tokens.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Skeleton variant="rounded" width={360} height={320} sx={{ borderRadius: "8px" }} />
      </Box>
    );
  }

  if (!page) return <GenericThankYou />;

  // The lead magnet, when this form gives one, is the page's one call to
  // action: a second button (WhatsApp us) beside it splits the tap.
  const magnet = pagePlan ? resolveMagnet(page, pagePlan.pipeline_kind) : planToken ? resolveMagnet(page, "seller") : null;
  const gift = magnet && magnet.kind !== "none" ? magnet : null;
  // Where the button goes: their own plan when we know who they are; else
  // the PDF itself, or the general plan for this form.
  const giftUrl = !gift ? "" : planToken ? `/plan/${planToken}?from=thanks` : gift.kind === "pdf" ? gift.pdfUrl ?? "" : `/plan/general/${page.slug}`;
  // Asking for a call time needs to know who they are (their private code).
  // When it's on, it is the main button and the lead magnet becomes a line.
  // From a Facebook instant form's end button we don't know who they are, so
  // they type their number once (ThankYouCallTime byPhone).
  const byPhone = !planToken && page.sourceType === "fb_form";
  const askCall = (!!planToken || preview || byPhone) && page.thankYouAskCall === true;
  const video = page.thankYouVideoUrl && canPlayVideo(page.thankYouVideoUrl) ? page.thankYouVideoUrl : null;
  const showNext = () => nextRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  // How far they watched (with the sound on), in their lead's history: the
  // start, 25%, 50%, 75% and the end. Only for someone who just sent the
  // form (their private code); never the preview.
  const onVideoProgress = (p: VideoProgress) => {
    if (!planToken || preview || !p.duration) return;
    const pct = p.ended ? 100 : (p.position / p.duration) * 100;
    const step = [100, 75, 50, 25, 1].find((m) => pct >= m - 0.01) ?? 0;
    if (!step || step <= reported.current) return;
    reported.current = step;
    void supabase.rpc("log_video_watch", { p_token: planToken, p_percent: step === 1 ? 0 : step, p_seconds: Math.round(p.ended ? p.duration : p.position) }).then(() => {}, () => {});
  };
  const endCta: EndCta | undefined = askCall
    ? { label: "Pick a time for our call", onClick: showNext, below: true }
    : gift && giftUrl
      ? { label: gift.button, onClick: () => window.open(giftUrl, "_blank", "noopener") }
      : undefined;

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: tokens.bg }}>
      <Box sx={{ bgcolor: page.accentColor, color: "#fff", p: "14px 20px", textAlign: "center" }}>
        <HeaderBrand page={page} />
      </Box>

      <Box sx={{ display: "flex", justifyContent: "center", p: 2 }}>
        <Box sx={{ width: "100%", maxWidth: 480, mt: video ? 2.5 : 7 }}>
          <Box sx={{ border: "1px solid #e0e0e0", borderRadius: "8px", bgcolor: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.08)" }}>
            <Box sx={{ p: "40px 24px", minHeight: 260, display: "flex", flexDirection: "column" }}>
              <BrandedThankYou page={page} name={name} video={video} endCta={endCta} onVideoEnd={showNext} onVideoProgress={onVideoProgress} showWhatsApp={!gift && !askCall && !video} />
              <Box ref={nextRef}>
                {askCall && <ThankYouCallTime token={planToken ?? ""} slug={page.slug} byPhone={byPhone} seller={pagePlan?.pipeline_kind === "seller"} preview={preview} accent={page.accentColor} agentName={page.agentName} question={page.thankYouCallQuestion} onSaved={() => setTimePicked(true)} />}
                {gift && giftUrl && <Box ref={magnetRef}><MagnetCta page={page} magnet={gift} href={giftUrl} personal={!!planToken} compact={askCall && !timePicked} attract={timePicked || !askCall} still={!!video} /></Box>}
              </Box>
            </Box>
          </Box>
          <SoldListingsSection agentId={page.agentId} />
          <PoweredByEstateKit refSlug={page.slug} placement="thank_you" />
        </Box>
      </Box>
    </Box>
  );
}

/** The form's lead magnet as the page's call to action: the same headline,
 *  line and link as the box in the confirmation email (lib/leadMagnet.ts).
 *  Only shown when the lead page made a code for it, which it does only when
 *  the form has one. */
// The button's "tap me": a wiggle every few seconds and a sweep of light.
const ATTRACT = {
  position: "relative", overflow: "hidden",
  "@media (prefers-reduced-motion: no-preference)": {
    animation: "ek-wiggle 2.8s ease-in-out infinite",
    "&::after": { content: '""', position: "absolute", top: 0, left: "-60%", width: "40%", height: "100%", background: "linear-gradient(120deg, transparent, rgba(255,255,255,.5), transparent)", transform: "skewX(-20deg)", animation: "ek-shine 2.8s ease-in-out infinite" },
  },
  "@keyframes ek-wiggle": { "0%, 55%, 100%": { transform: "rotate(0) scale(1)" }, "60%": { transform: "rotate(-1.6deg) scale(1.03)" }, "70%": { transform: "rotate(1.6deg) scale(1.03)" }, "80%": { transform: "rotate(-1.2deg) scale(1.02)" }, "90%": { transform: "rotate(0) scale(1)" } },
  "@keyframes ek-shine": { "0%, 45%": { left: "-60%" }, "85%, 100%": { left: "140%" } },
} as const;

function MagnetCta({ page, magnet, href, personal, compact, still, attract }: { page: LeadPage; magnet: Magnet; href: string; personal: boolean; compact?: boolean; still?: boolean; attract?: boolean }) {
  const Icon = magnet.kind === "plan" ? AutoStoriesOutlinedIcon : DescriptionOutlinedIcon;
  // Second to the call-time button: one line, not a second big button.
  if (compact) {
    return (
      <Box
        component="a"
        href={href}
        target="_blank"
        rel="noopener"
        sx={{ display: "flex", alignItems: "center", gap: 1.25, mt: 2.5, p: 1.5, borderRadius: "10px", border: "1px solid #e0e0e0", color: "#1d2327", textDecoration: "none", "&:hover": { bgcolor: "#fafafa" } }}
      >
        <Icon sx={{ color: page.accentColor }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 12, color: "#5b6670" }}>While you wait</Typography>
          <Typography sx={{ fontSize: 15, fontWeight: 700, lineHeight: 1.3 }}>{magnet.title}</Typography>
        </Box>
        <ArrowForwardIcon sx={{ color: "#5b6670" }} />
      </Box>
    );
  }
  return (
    <Box sx={{ mt: 3.5, pt: 3, borderTop: "1px solid #eee", textAlign: "left" }}>
      <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: page.accentColor, textAlign: "center", mb: 1.5 }}>
        While you wait
      </Typography>
      <Box sx={{ display: "flex", gap: 2, alignItems: "center", p: 2, borderRadius: "12px", bgcolor: `color-mix(in srgb, ${page.accentColor} 7%, #fff)`, border: `1px solid color-mix(in srgb, ${page.accentColor} 22%, #fff)` }}>
        {/* A little cover, so it reads as something to keep, not a link. */}
        <Box sx={{ position: "relative", width: 58, height: 74, flex: "none", borderRadius: "4px 8px 8px 4px", bgcolor: page.accentColor, color: readableOn(page.accentColor), display: "grid", placeItems: "center", boxShadow: "0 6px 14px rgba(0,0,0,.18)", transform: "rotate(-4deg)" }}>
          <Box sx={{ position: "absolute", left: 6, top: 0, bottom: 0, width: 2, bgcolor: "rgba(255,255,255,.35)" }} />
          <Icon sx={{ fontSize: 28 }} />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 17, fontWeight: 800, lineHeight: 1.25, color: "#1d2327" }}>{magnet.title}</Typography>
          {magnet.text && <Typography sx={{ fontSize: 14, color: "#5b6670", mt: 0.5, lineHeight: 1.45 }}>{magnet.text}</Typography>}
          <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: "#2e7d32", mt: 0.75 }}>{personal ? "Free · made for you" : "Free"}</Typography>
        </Box>
      </Box>
      {/* The form's own button, so the end page looks like the form. */}
      <Button
        variant="contained"
        size="large"
        fullWidth
        href={href}
        target="_blank"
        rel="noopener"
        endIcon={<ArrowForwardIcon />}
        sx={{
          mt: 2, ...(attract ? ATTRACT : {}), bgcolor: page.accentColor, color: readableOn(page.accentColor), "&:hover": { bgcolor: page.accentColor, filter: "brightness(0.9)" },
          "& .MuiButton-endIcon": { animation: still ? "none" : "ek-nudge 1.6s ease-in-out infinite" },
          "@keyframes ek-nudge": { "0%, 100%": { transform: "translateX(0)" }, "50%": { transform: "translateX(4px)" } },
          "@media (prefers-reduced-motion: reduce)": { "& .MuiButton-endIcon": { animation: "none" } },
        }}
      >
        {magnet.button}
      </Button>
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

/** fillMessage, but with no name "{name}" is left out (and the space before
 *  it), so "Thanks {name}!" reads "Thanks!". */
function fillNamed(text: string, name: string, agentName: string | null | undefined): string {
  return name ? fillMessage(text, name, agentName) : fillMessage((text || "").replace(/\s*\{name\}/g, ""), "", agentName);
}

const WA_GREEN = "#25D366";

/** With a video: photo, headline, then the video straight under it (no
 *  subtext, label or divider), so nothing stands between them and Play. */
function BrandedThankYou({ page, name, video, endCta, onVideoEnd, onVideoProgress, showWhatsApp }: { page: LeadPage; name: string; video: string | null; endCta?: EndCta; onVideoEnd: () => void; onVideoProgress: (p: VideoProgress) => void; showWhatsApp: boolean }) {
  const hasPhoto = !!page.profilePhotoDataUrl;
  const size = hasPhoto ? 76 : 96;
  return (
    <Box sx={{ textAlign: "center" }}>
      {/* Half over the card's top edge (the card has 40px padding). With a
          video there's no photo: the headline, then the video. */}
      {!video && (
      <Box sx={{ position: "relative", width: size, height: size, mx: "auto", mt: `-${40 + size / 2}px`, mb: 2 }}>
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            // WhatsApp green: plants that the next thing is a WhatsApp from the agent.
            border: `2px solid ${WA_GREEN}`,
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
              bgcolor: WA_GREEN,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <WhatsAppIcon sx={{ fontSize: 48, color: "#fff" }} />
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
              bgcolor: WA_GREEN,
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 0 0 3px #fff",
            }}
          >
            <WhatsAppIcon sx={{ fontSize: 16 }} />
          </Box>
        )}
      </Box>
      )}
      <Typography sx={{ fontSize: 20, fontWeight: 700 }}>{fillNamed(page.thankYouHeadline, name, page.agentName)}</Typography>
      {video ? (
        <Box sx={{ mt: 2.5 }}>
          <VideoPlayer url={video} accent={page.accentColor} autoplay endCta={endCta} onProgress={(p) => { onVideoProgress(p); if (p.ended) window.setTimeout(onVideoEnd, 1200); }} />
        </Box>
      ) : (
        <Typography sx={{ fontSize: 14, color: "text.secondary", mt: 1 }}>{fillNamed(page.thankYouSubtext, name, page.agentName)}</Typography>
      )}

      {showWhatsApp && (() => {
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
              mt: 3, mx: "auto", maxWidth: 340, bgcolor: WA_GREEN, color: "#fff",
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

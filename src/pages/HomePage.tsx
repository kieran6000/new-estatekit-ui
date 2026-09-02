import { useState } from "react";
import { AppBar, Avatar, Box, Button, TextField, Toolbar, Typography } from "@mui/material";
import EventIcon from "@mui/icons-material/Event";
import MailOutlineIcon from "@mui/icons-material/Mail";
import StorefrontIcon from "@mui/icons-material/Storefront";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import PlayCircleOutlineIcon from "@mui/icons-material/PlayCircleOutlineRounded";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { tokens } from "../theme";
import { useSendCallQuestion } from "../hooks/useSupport";
import { useSnack } from "../hooks/useSnack";
import TicketDialog from "../components/TicketDialog";

const DOCS: [string, string][] = [
  ["Ad templates", "https://drive.google.com"],
  ["Landing pages", "https://drive.google.com"],
  ["Forms", "https://drive.google.com"],
];

const WHOP_COURSE_URL = "https://whop.com/estatekit/ads-that-convert";
const COURSE_BANNER_IMAGE = "https://i.imgur.com/9TvDhuJ.png";
const WATCH_AND_LEARN: { title: string; thumbnail: string; url: string }[] = [
  { title: "Buyer & Seller Ads", thumbnail: "https://i.imgur.com/9TvDhuJ.png", url: "https://whop.com/estatekit/buyer-seller-ads" },
  { title: "Fix a Problem", thumbnail: "https://i.imgur.com/q8a1KNu.png", url: "https://whop.com/estatekit/fix-a-problem" },
];

function GoogleMeetLogo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2" y="5" width="14" height="14" rx="3" fill="#00832d" />
      <path d="M16 9.5 22 6v12l-6-3.5z" fill="#00ac47" />
      <path d="M16 9.5v5l3.2 1.86A1.5 1.5 0 0 0 22 15.1V8.9a1.5 1.5 0 0 0-2.8-.76z" fill="#ffba00" />
      <path d="M2 5v3h6.2L16 5z" fill="#00ac47" />
      <path d="M2 16v3h6.2L16 19z" fill="#0066da" />
    </svg>
  );
}

export default function HomePage() {
  const sendQuestion = useSendCallQuestion();
  const showSnack = useSnack();
  const [question, setQuestion] = useState("");
  const [ticketOpen, setTicketOpen] = useState(false);

  async function submitQuestion() {
    const v = question.trim();
    if (!v) return;
    setQuestion("");
    try {
      await sendQuestion.mutateAsync(v);
      showSnack("Question sent for the call");
    } catch {
      showSnack("Could not send question");
    }
  }

  return (
    <Box>
      <AppBar position="sticky">
        <Toolbar sx={{ height: 56, minHeight: "56px !important" }}>
          <Typography sx={{ fontSize: 18, fontWeight: 500, flex: 1 }}>Home</Typography>
          <Avatar sx={{ width: 32, height: 32, bgcolor: tokens.primary, fontSize: 14 }}>K</Avatar>
        </Toolbar>
      </AppBar>

      <Box sx={{ maxWidth: 680, mx: "auto", pb: 3 }}>
      <Box sx={{ m: "12px 16px 0", border: `1px solid ${tokens.divider}`, borderRadius: "8px", bgcolor: "background.paper", p: "14px 16px", boxShadow: "0 1px 2px rgba(0,0,0,.14)" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Box sx={{ position: "relative", width: 40, height: 40, borderRadius: "8px", bgcolor: tokens.primaryBg, color: tokens.primary, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}>
            <EventIcon />
            <Box
              sx={{
                position: "absolute",
                top: -3,
                right: -3,
                width: 11,
                height: 11,
                borderRadius: "50%",
                bgcolor: tokens.red,
                boxShadow: `0 0 0 2px ${tokens.surface}`,
                "&:before": {
                  content: '""',
                  position: "absolute",
                  inset: 0,
                  borderRadius: "50%",
                  bgcolor: tokens.red,
                  animation: "ek-ping 1.6s cubic-bezier(0,0,0.2,1) infinite",
                },
                "@keyframes ek-ping": {
                  "0%": { transform: "scale(1)", opacity: 0.7 },
                  "75%,100%": { transform: "scale(2.4)", opacity: 0 },
                },
              }}
            />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: 15, fontWeight: 500 }}>Next group call — Thu 4 Sep, 3:00 PM</Typography>
            <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>Send a question now to get it answered live.</Typography>
          </Box>
          <Box sx={{ bgcolor: "#e6f4ea", color: tokens.greenDark, fontSize: 12, fontWeight: 600, borderRadius: "12px", p: "4px 10px", whiteSpace: "nowrap" }}>
            in 6 days
          </Box>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mt: 1.25, ml: "52px" }}>
          <GoogleMeetLogo size={16} />
          <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>On Google Meet — link opens 10 min before</Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 1, mt: 1.5 }}>
          <TextField
            size="small"
            fullWidth
            placeholder="Ask a question for this call…"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <Button variant="contained" onClick={submitQuestion}>
            Send
          </Button>
        </Box>
      </Box>

      <Box sx={{ display: "flex", gap: "1px", bgcolor: tokens.divider, borderBottom: `8px solid ${tokens.bg}`, mt: 2 }}>
        <Box
          component="button"
          onClick={() => setTicketOpen(true)}
          sx={{ flex: 1, bgcolor: "#fff", p: "14px", textAlign: "center", color: tokens.primary, fontWeight: 500, fontSize: 13, textTransform: "uppercase", display: "flex", alignItems: "center", justifyContent: "center", gap: 1, border: 0, cursor: "pointer", "&:hover": { bgcolor: tokens.primaryBg } }}
        >
          <MailOutlineIcon fontSize="small" /> Message us
        </Box>
        <Box
          component="a"
          href="https://estatekit.co"
          target="_blank"
          rel="noopener"
          sx={{ flex: 1, bgcolor: "#fff", p: "14px", textAlign: "center", color: tokens.primary, fontWeight: 500, fontSize: 13, textTransform: "uppercase", display: "flex", alignItems: "center", justifyContent: "center", gap: 1, textDecoration: "none", "&:hover": { bgcolor: tokens.primaryBg } }}
        >
          <StorefrontIcon fontSize="small" /> Hire the agency
        </Box>
      </Box>

      <Typography sx={{ fontSize: 12, fontWeight: 500, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.06em", p: "16px 16px 8px" }}>
        Your course
      </Typography>
      <Box sx={{ px: 2 }}>
        <Box
          component="a"
          href={WHOP_COURSE_URL}
          target="_blank"
          rel="noopener"
          sx={{
            display: "flex",
            borderRadius: "12px",
            overflow: "hidden",
            textDecoration: "none",
            boxShadow: "0 1px 2px rgba(0,0,0,.14)",
          }}
        >
          <Box sx={{ width: 108, flexShrink: 0, bgcolor: "#0d1b2e", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Box component="img" src={COURSE_BANNER_IMAGE} alt="" sx={{ width: "100%", height: "100%", objectFit: "contain" }} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0, background: `linear-gradient(135deg, ${tokens.primaryDark}, ${tokens.primary})`, color: "#fff", p: "16px 18px" }}>
            <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", opacity: 0.85 }}>YOUR COURSE</Typography>
            <Typography sx={{ fontSize: 17, fontWeight: 700, mt: 0.5 }}>Ads That Convert: The Full EstateKit Course</Typography>
            <Typography sx={{ fontSize: 13, opacity: 0.85, mt: 0.5, display: "flex", alignItems: "center", gap: 0.4 }}>
              Watch on Whop <OpenInNewIcon sx={{ fontSize: 14 }} />
            </Typography>
          </Box>
        </Box>
      </Box>

      <Typography sx={{ fontSize: 12, fontWeight: 500, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.06em", p: "16px 16px 8px" }}>
        Watch &amp; learn
      </Typography>
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5, px: 2 }}>
        {WATCH_AND_LEARN.map((v) => (
          <Box
            key={v.title}
            component="a"
            href={v.url}
            target="_blank"
            rel="noopener"
            sx={{
              display: "flex",
              flexDirection: "column",
              borderRadius: "12px",
              overflow: "hidden",
              textDecoration: "none",
              cursor: "pointer",
              boxShadow: "0 1px 2px rgba(0,0,0,.14)",
              bgcolor: "background.paper",
            }}
          >
            <Box sx={{ position: "relative", width: "100%", aspectRatio: "16/10", bgcolor: "#0d1b2e" }}>
              <Box component="img" src={v.thumbnail} alt="" sx={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }} />
              <PlayCircleOutlineIcon sx={{ position: "absolute", top: 8, right: 8, color: "#fff", opacity: 0.9 }} />
            </Box>
            <Typography sx={{ p: "10px 12px", fontWeight: 500, fontSize: 13.5, lineHeight: 1.2, color: "text.primary" }}>{v.title}</Typography>
          </Box>
        ))}
      </Box>

      <Typography sx={{ fontSize: 12, fontWeight: 500, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.06em", p: "16px 16px 8px" }}>
        Templates &amp; links
      </Typography>
      <Box sx={{ bgcolor: "background.paper", borderTop: `1px solid ${tokens.divider}`, borderBottom: `1px solid ${tokens.divider}`, mt: 1 }}>
        {DOCS.map(([label, url], i) => (
          <Box
            key={label}
            component="a"
            href={url}
            target="_blank"
            rel="noopener"
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.75,
              p: "12px 16px",
              width: "100%",
              border: 0,
              bgcolor: "transparent",
              borderBottom: i < DOCS.length - 1 ? `1px solid ${tokens.divider2}` : 0,
              textDecoration: "none",
              color: "inherit",
              textAlign: "left",
              cursor: "pointer",
              font: "inherit",
            }}
          >
            <DescriptionOutlinedIcon sx={{ color: tokens.primary }} />
            <Typography sx={{ flex: 1, fontWeight: 500, fontSize: 14 }}>{label}</Typography>
            <ChevronRightIcon sx={{ color: "text.disabled" }} />
          </Box>
        ))}
      </Box>

      <TicketDialog open={ticketOpen} onClose={() => setTicketOpen(false)} />
      </Box>
    </Box>
  );
}

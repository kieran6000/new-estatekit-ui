import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppBar, Avatar, Box, Button, LinearProgress, TextField, Toolbar, Typography } from "@mui/material";
import EventIcon from "@mui/icons-material/Event";
import MailOutlineIcon from "@mui/icons-material/Mail";
import StorefrontIcon from "@mui/icons-material/Storefront";
import CheckIcon from "@mui/icons-material/Check";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import LockIcon from "@mui/icons-material/Lock";
import { tokens } from "../theme";
import { useMarkStepDone, useSetupSteps } from "../hooks/useSetupSteps";
import { useSendCallQuestion } from "../hooks/useSupport";
import { useSnack } from "../hooks/useSnack";
import { useCourseModules } from "../hooks/useCourses";
import TicketDialog from "../components/TicketDialog";

const DOCS: [string, string, boolean?][] = [
  ["Ad templates", "https://drive.google.com"],
  ["Landing pages", "https://drive.google.com"],
  ["Forms", "https://drive.google.com"],
  ["My lead page", "/lead-page", true],
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
  const navigate = useNavigate();
  const { data: steps = [] } = useSetupSteps();
  const { data: modules } = useCourseModules();
  const markDone = useMarkStepDone();
  const sendQuestion = useSendCallQuestion();
  const showSnack = useSnack();
  const [question, setQuestion] = useState("");
  const [ticketOpen, setTicketOpen] = useState(false);

  const done = steps.filter((s) => s.done).length;
  const total = steps.length || 4;
  const left = total - done;

  const progress = useMemo(() => (total ? (done / total) * 100 : 0), [done, total]);

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
    <Box sx={{ maxWidth: 680, mx: "auto", pb: 3 }}>
      <AppBar position="sticky">
        <Toolbar sx={{ height: 56, minHeight: "56px !important" }}>
          <Typography sx={{ fontSize: 18, fontWeight: 500, flex: 1 }}>Home</Typography>
          <Avatar sx={{ width: 32, height: 32, bgcolor: tokens.primary, fontSize: 14 }}>K</Avatar>
        </Toolbar>
      </AppBar>

      {left > 0 && (
        <Box sx={{ bgcolor: "background.paper", p: 2, borderBottom: `1px solid ${tokens.divider}` }}>
          <Typography sx={{ fontSize: 15, fontWeight: 500 }}>
            {total ? `You're ${done} of ${total} set up` : "Setting up…"}
          </Typography>
          <LinearProgress
            variant="determinate"
            value={progress}
            sx={{ height: 4, borderRadius: 2, mt: 1.25, bgcolor: tokens.divider, "& .MuiLinearProgress-bar": { bgcolor: tokens.primary } }}
          />
          <Typography sx={{ color: "text.secondary", fontSize: 13, mt: 0.75 }}>one call and you're live</Typography>
        </Box>
      )}

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

      {left > 0 && (
      <>
      <Typography sx={{ fontSize: 12, fontWeight: 500, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.06em", p: "14px 16px 6px" }}>
        Finish setup
      </Typography>
      <Box sx={{ bgcolor: "background.paper", borderTop: `1px solid ${tokens.divider}`, borderBottom: `1px solid ${tokens.divider}` }}>
        {steps.map((s, i) => (
          <Box
            key={s.id}
            sx={{ display: "flex", alignItems: "center", gap: 1.75, p: "12px 16px", borderBottom: i < steps.length - 1 ? `1px solid ${tokens.divider2}` : 0 }}
          >
            <Box
              sx={{
                width: 24,
                height: 24,
                borderRadius: "50%",
                border: `2px solid ${s.done ? tokens.green : tokens.ink3}`,
                bgcolor: s.done ? tokens.green : "transparent",
                color: s.done ? "#fff" : tokens.ink3,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 13,
                fontWeight: 600,
                flex: "0 0 auto",
              }}
            >
              {s.done ? <CheckIcon sx={{ fontSize: 15 }} /> : i + 1}
            </Box>
            <Typography sx={{ flex: 1, fontWeight: 500, fontSize: 15, color: s.done ? "text.secondary" : "text.primary" }}>{s.title}</Typography>
            {s.done ? null : s.cta_url ? (
              <Button
                variant={s.cta_filled ? "contained" : "text"}
                size="small"
                href={s.cta_url}
                target="_blank"
                rel="noopener"
                onClick={() => setTimeout(() => markDone.mutate(s.id), 350)}
              >
                {s.cta_label}
              </Button>
            ) : null}
          </Box>
        ))}
      </Box>
      </>
      )}

      <Typography sx={{ fontSize: 12, fontWeight: 500, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.06em", p: "16px 16px 8px" }}>
        Guides
      </Typography>
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 1.5, px: 2 }}>
        {modules.map((m) => (
          <Box
            key={m.id}
            component="button"
            onClick={() => navigate(m.locked ? "/upgrade" : `/courses/${m.id}`)}
            sx={{
              position: "relative",
              display: "flex",
              flexDirection: "column",
              justifyContent: "flex-end",
              aspectRatio: "1/1",
              borderRadius: "12px",
              overflow: "hidden",
              border: 0,
              p: 0,
              cursor: "pointer",
              boxShadow: "0 1px 2px rgba(0,0,0,.14)",
              textAlign: "left",
            }}
          >
            <Box
              component="img"
              src={m.thumbnail}
              alt=""
              sx={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: m.locked ? 0.35 : 0.9 }}
            />
            <Box sx={{ position: "absolute", inset: 0, background: "linear-gradient(0deg, rgba(0,0,0,.55), rgba(0,0,0,0) 60%)" }} />
            {m.locked ? (
              <Box sx={{ position: "relative", p: 1.75, color: "#fff" }}>
                <LockIcon sx={{ display: "block", mb: 0.5 }} />
                <Typography sx={{ fontWeight: 700, fontSize: 13, lineHeight: 1.15 }}>{m.title}</Typography>
                <Typography sx={{ fontSize: 11, fontWeight: 600, mt: 0.5, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  Unlock with paid
                </Typography>
              </Box>
            ) : (
              <Typography sx={{ position: "relative", p: 1.75, color: "#fff", fontWeight: 700, fontSize: 14, lineHeight: 1.15, textShadow: "0 1px 6px rgba(0,0,0,.5)" }}>
                {m.title}
              </Typography>
            )}
          </Box>
        ))}
      </Box>

      <Typography sx={{ fontSize: 12, fontWeight: 500, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.06em", p: "16px 16px 8px" }}>
        Templates &amp; links
      </Typography>
      <Box sx={{ bgcolor: "background.paper", borderTop: `1px solid ${tokens.divider}`, borderBottom: `1px solid ${tokens.divider}`, mt: 1 }}>
        {DOCS.map(([label, url, internal], i) => (
          <Box
            key={label}
            component={internal ? "button" : "a"}
            onClick={internal ? () => navigate(url) : undefined}
            href={internal ? undefined : url}
            target={internal ? undefined : "_blank"}
            rel={internal ? undefined : "noopener"}
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
  );
}

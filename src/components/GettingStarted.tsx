import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Button, Collapse, IconButton, LinearProgress, Typography } from "@mui/material";
import { usePostHog } from "@posthog/react";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import CloseIcon from "@mui/icons-material/Close";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { tokens } from "../theme";
import { ADMIN_WHATSAPP } from "../lib/contact";
import type { AgentProfile } from "../api/agentProfile";
import type { LeadRow } from "../types";

// "Getting started" checklist at the top of Leads. A checklist beats a tour
// for completion: it's always visible, shows progress, and every item is one
// tap to the place that finishes it. Items tick themselves off from real data
// (photo uploaded, first lead in, first call made), so nothing is ever
// marked done by hand. The first item starts ticked, so the bar never shows
// zero. It hides itself once everything is done, or when they hide it.

interface Item {
  key: string;
  label: string;
  hint: string;
  done: boolean;
  cta?: { label: string; onClick: () => void };
}

function hiddenKey(agentId: string) {
  return `estatekit_getting_started_hidden_${agentId}`;
}
function readHidden(agentId: string): boolean {
  try { return localStorage.getItem(hiddenKey(agentId)) === "1"; } catch { return false; }
}

export default function GettingStarted({
  profile,
  leads,
  tourSeen,
  onStartTour,
}: {
  profile: AgentProfile | null | undefined;
  leads: LeadRow[];
  tourSeen: boolean;
  onStartTour: () => void;
}) {
  const navigate = useNavigate();
  const posthog = usePostHog();
  const agentId = profile?.agentId ?? "";
  const [hidden, setHidden] = useState(() => (agentId ? readHidden(agentId) : false));
  useEffect(() => { if (agentId) setHidden(readHidden(agentId)); }, [agentId]);

  const firstNew = leads.find((l) => !l.archived && l.stage === "New Lead");
  const whatsappAdmin = (text: string) => window.open(`https://wa.me/${ADMIN_WHATSAPP}?text=${encodeURIComponent(text)}`, "_blank", "noopener");

  const items: Item[] = [
    { key: "signed_up", label: "Create your account", hint: "Done. Welcome aboard.", done: true },
    {
      key: "tour",
      label: "Take the 30-second tour",
      hint: "The 4 things you'll use every day.",
      done: tourSeen,
      cta: { label: "Start", onClick: onStartTour },
    },
    {
      key: "photo",
      label: "Add your photo",
      hint: "Sellers trust a face. It shows on your lead page's thank-you screen.",
      done: !!profile?.avatarUrl,
      cta: { label: "Add", onClick: () => navigate("/account") },
    },
    {
      key: "logo",
      label: "Add your agency logo",
      hint: "It brands your lead page and your dashboard.",
      done: !!profile?.sidebarLogoUrl,
      cta: { label: "Add", onClick: () => navigate("/account") },
    },
    {
      key: "facebook",
      label: "Connect your Facebook page",
      hint: "So your ads run from your page and leads flow in here.",
      done: !!profile?.fbPageId,
      cta: {
        label: "Help me",
        onClick: () => whatsappAdmin(`Hi, it's ${profile?.displayName || "me"}. Please help me connect my Facebook page to EstateKit.`),
      },
    },
    {
      key: "first_lead",
      label: "Get your first lead",
      hint: "Arrives once your ads are live. Share your lead page link to get one sooner.",
      done: leads.length > 0,
      cta: { label: "My page", onClick: () => navigate("/lead-page") },
    },
    {
      key: "first_call",
      label: "Call your first lead",
      hint: "The fastest caller usually wins the listing.",
      done: leads.some((l) => l.stage !== "New Lead"),
      cta: firstNew ? { label: "Call", onClick: () => navigate(`/leads/${firstNew.id}`) } : undefined,
    },
  ];

  const done = items.filter((i) => i.done).length;
  const total = items.length;
  const complete = done === total;
  const next = items.find((i) => !i.done);
  // Open by default while there's real setup left; a nearly-done account sees
  // one tidy line instead.
  const [open, setOpen] = useState(done / total < 0.6);

  const tracked = useRef(false);
  useEffect(() => {
    if (!profile || tracked.current || hidden) return;
    tracked.current = true;
    posthog.capture(complete ? "checklist_completed" : "checklist_viewed", { done, total, next: next?.key ?? null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, hidden]);

  if (!profile || hidden || complete) return null;

  function hide() {
    try { localStorage.setItem(hiddenKey(agentId), "1"); } catch { /* ignore */ }
    posthog.capture("checklist_hidden", { done, total });
    setHidden(true);
  }

  function run(item: Item) {
    posthog.capture("checklist_item_clicked", { item: item.key, done, total });
    item.cta?.onClick();
  }

  return (
    <Box sx={{ m: { xs: 1.5, sm: 2 }, mb: { xs: 0, sm: 0 }, bgcolor: "background.paper", border: `1px solid ${tokens.divider}`, borderRadius: "10px", overflow: "hidden" }}>
      <Box
        component="button"
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        sx={{ display: "flex", alignItems: "center", gap: 1.5, width: "100%", p: "12px 14px 12px 16px", border: 0, bgcolor: "transparent", cursor: "pointer", font: "inherit", textAlign: "left" }}
      >
        <ProgressRing value={done / total} label={`${done}/${total}`} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 15, fontWeight: 600, lineHeight: 1.3 }}>Getting started</Typography>
          <Typography sx={{ fontSize: 13, color: tokens.ink2, lineHeight: 1.35, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {next ? <>Next: <b>{next.label}</b></> : "All done"}
          </Typography>
        </Box>
        <ExpandMoreIcon sx={{ color: tokens.ink3, transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
      </Box>
      <LinearProgress
        variant="determinate"
        value={(done / total) * 100}
        sx={{ height: 3, bgcolor: tokens.surface2, "& .MuiLinearProgress-bar": { bgcolor: tokens.green } }}
      />

      <Collapse in={open}>
        <Box>
          {items.map((item) => (
            <Row key={item.key} item={item} isNext={item === next} onRun={() => run(item)} />
          ))}
          <Box sx={{ display: "flex", justifyContent: "flex-end", px: 1, py: 0.5, borderTop: `1px solid ${tokens.divider2}` }}>
            <Button size="small" startIcon={<CloseIcon sx={{ fontSize: "16px !important" }} />} onClick={hide} sx={{ color: tokens.ink3, textTransform: "none", fontWeight: 500 }}>
              Hide this
            </Button>
          </Box>
        </Box>
      </Collapse>
    </Box>
  );
}

function Row({ item, isNext, onRun }: { item: Item; isNext: boolean; onRun: () => void }) {
  const clickable = !item.done && !!item.cta;
  return (
    <Box
      onClick={clickable ? onRun : undefined}
      sx={{
        display: "flex", alignItems: "center", gap: 1.5, px: 2, py: 1.25,
        borderTop: `1px solid ${tokens.divider2}`,
        bgcolor: isNext ? "#f5f9ff" : "transparent",
        cursor: clickable ? "pointer" : "default",
        "&:hover": clickable ? { bgcolor: isNext ? "#eaf2ff" : tokens.hover } : {},
      }}
    >
      {item.done ? (
        <CheckCircleIcon sx={{ fontSize: 22, color: tokens.green }} />
      ) : (
        <RadioButtonUncheckedIcon sx={{ fontSize: 22, color: isNext ? tokens.primary : tokens.ink3 }} />
      )}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: 14, fontWeight: item.done ? 400 : 600, color: item.done ? tokens.ink3 : tokens.ink, textDecoration: item.done ? "line-through" : "none", lineHeight: 1.35 }}>
          {item.label}
        </Typography>
        {!item.done && <Typography sx={{ fontSize: 12.5, color: tokens.ink2, lineHeight: 1.4 }}>{item.hint}</Typography>}
      </Box>
      {clickable && (
        isNext ? (
          <Button size="small" variant="contained" onClick={(e) => { e.stopPropagation(); onRun(); }} sx={{ flexShrink: 0 }}>
            {item.cta!.label}
          </Button>
        ) : (
          <IconButton size="small" aria-label={item.cta!.label} onClick={(e) => { e.stopPropagation(); onRun(); }}>
            <ChevronRightIcon />
          </IconButton>
        )
      )}
    </Box>
  );
}

function ProgressRing({ value, label }: { value: number; label: ReactNode }) {
  const r = 17;
  const c = 2 * Math.PI * r;
  return (
    <Box sx={{ position: "relative", width: 42, height: 42, flexShrink: 0 }}>
      <Box component="svg" viewBox="0 0 42 42" sx={{ width: 42, height: 42, transform: "rotate(-90deg)" }}>
        <circle cx="21" cy="21" r={r} fill="none" stroke="#e6e9ec" strokeWidth="4" />
        <circle cx="21" cy="21" r={r} fill="none" stroke="#2e7d32" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${c * value} ${c}`} />
      </Box>
      <Typography sx={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11.5, fontWeight: 700 }}>
        {label}
      </Typography>
    </Box>
  );
}

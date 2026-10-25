import { useMemo, useState } from "react";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppBar, Box, Button, IconButton, Skeleton, Toolbar, Typography } from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import EventIcon from "@mui/icons-material/Event";
import HomeWorkOutlinedIcon from "@mui/icons-material/HomeWorkOutlined";
import PhoneInTalkOutlinedIcon from "@mui/icons-material/PhoneInTalkOutlined";
import AlarmIcon from "@mui/icons-material/Alarm";
import PhoneIcon from "@mui/icons-material/Phone";
import { tokens } from "../theme";
import { useLeads } from "../hooks/useLeads";
import { useCanSeeFullPhone } from "../hooks/useTier";
import { maskPhone } from "../lib/format";
import { logLeadCall } from "../api/leadEvents";
import { getMyProfile } from "../api/agentProfile";
import { getActiveAgentIdSync } from "../api/_client";
import { useAuth } from "../hooks/useAuth";
import { calendarItems, overdue, weekDays, weekStart, type CalItem, type CalKind } from "../lib/calendar";

// Calendar: the week's appointments, viewings, call times leads picked and
// follow-ups, day by day, each with a Call button. Tap one to open the lead.
// The same dates go into Google Calendar when it's connected (Get set up).

const KIND: Record<CalKind, { icon: React.ReactNode; color: string }> = {
  appointment: { icon: <EventIcon fontSize="small" />, color: "#1565c0" },
  viewing: { icon: <HomeWorkOutlinedIcon fontSize="small" />, color: "#6a1b9a" },
  call: { icon: <PhoneInTalkOutlinedIcon fontSize="small" />, color: "#1a8f45" },
  followup: { icon: <AlarmIcon fontSize="small" />, color: "#ad1457" },
};

const time = (d: Date) => d.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", hour12: false });
const dayName = (d: Date, today: Date) => {
  const diff = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  const date = d.toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" }).replace(/,/g, "");
  return diff === 0 ? `Today · ${date}` : diff === 1 ? `Tomorrow · ${date}` : diff === -1 ? `Yesterday · ${date}` : date;
};

export default function CalendarPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: leads = [], isLoading } = useLeads();
  const { data: profile } = useQuery({ queryKey: ["myProfile"], queryFn: getMyProfile, staleTime: 5 * 60_000 });
  const canSeeFullPhone = useCanSeeFullPhone();
  const [offset, setOffset] = useState(0); // weeks from this one
  // Overdue follow-ups fold into one line, so today stays at the top.
  const [showLate, setShowLate] = useState(false);

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(weekStart(now).getTime() + offset * 7 * 86_400_000);
  const items = useMemo(() => calendarItems(leads), [leads]);
  const days = weekDays(items, start);
  const late = offset === 0 ? overdue(items, now) : [];
  const total = days.reduce((n, d) => n + d.items.length, 0);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
  const managingOther = !!getActiveAgentIdSync() && getActiveAgentIdSync() !== user?.id;

  return (
    <Box>
      <AppBar position="sticky">
        <Toolbar sx={{ height: 56, minHeight: "56px !important" }}>
          <Typography sx={{ fontSize: 18, fontWeight: 500 }}>Calendar</Typography>
        </Toolbar>
      </AppBar>

      <Box sx={{ maxWidth: 760, mx: "auto", p: 2, display: "flex", flexDirection: "column", gap: 2 }}>
        {/* The week, and moving between weeks. */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <IconButton aria-label="Previous week" onClick={() => setOffset((o) => o - 1)}><ChevronLeftIcon /></IconButton>
          <Typography sx={{ fontSize: 16, fontWeight: 600, flex: 1, textAlign: "center" }}>
            {offset === 0 ? "This week" : offset === 1 ? "Next week" : offset === -1 ? "Last week" : "Week"} · {fmt(start)} – {fmt(end)}
          </Typography>
          <IconButton aria-label="Next week" onClick={() => setOffset((o) => o + 1)}><ChevronRightIcon /></IconButton>
        </Box>
        {offset !== 0 && <Button onClick={() => setOffset(0)} sx={{ alignSelf: "center", mt: -1.5 }}>Back to this week</Button>}

        {!profile?.googleCalendarEmail && !managingOther && (
          <Typography sx={{ fontSize: 13, color: "text.secondary", textAlign: "center", mt: -1 }}>
            Want these in your Google Calendar too? <Box component={RouterLink} to="/setup" sx={{ color: tokens.primary }}>Connect it in Get set up</Box>.
          </Typography>
        )}

        {isLoading ? (
          <Skeleton variant="rounded" height={320} sx={{ borderRadius: "8px" }} />
        ) : (
          <>
            {late.length > 0 && (
              <Day title={`Overdue follow-ups (${late.length})`} warn open={showLate} onToggle={() => setShowLate((v) => !v)}>
                {showLate && late.map((it) => <Row key={`${it.lead.id}-${it.kind}`} it={it} showDate canSeeFullPhone={canSeeFullPhone} onOpen={() => navigate(`/leads/${it.lead.id}`)} />)}
              </Day>
            )}
            {total === 0 && late.length === 0 && (
              <Box sx={{ textAlign: "center", py: 6, color: "text.secondary" }}>
                <EventIcon sx={{ fontSize: 40, color: tokens.ink3 }} />
                <Typography sx={{ fontSize: 15, mt: 1 }}>Nothing booked this week.</Typography>
                <Typography sx={{ fontSize: 13.5 }}>Appointments, call times leads pick and follow-ups show here.</Typography>
              </Box>
            )}
            {days.filter((d) => d.items.length > 0).map((d) => (
              <Day key={d.day.toISOString()} title={dayName(d.day, today)} isToday={d.day.getTime() === today.getTime()}>
                {d.items.map((it) => <Row key={`${it.lead.id}-${it.kind}`} it={it} canSeeFullPhone={canSeeFullPhone} onOpen={() => navigate(`/leads/${it.lead.id}`)} />)}
              </Day>
            ))}
          </>
        )}
      </Box>
    </Box>
  );
}

function Day({ title, isToday, warn, open, onToggle, children }: { title: string; isToday?: boolean; warn?: boolean; open?: boolean; onToggle?: () => void; children: React.ReactNode }) {
  return (
    <Box sx={{ border: `1px solid ${warn ? tokens.amberBorder : isToday ? tokens.primaryBorder : tokens.divider}`, borderRadius: "8px", bgcolor: "background.paper", overflow: "hidden" }}>
      <Typography onClick={onToggle} role={onToggle ? "button" : undefined} aria-expanded={onToggle ? !!open : undefined} sx={{ cursor: onToggle ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "space-between", px: 2, py: 1, fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: warn ? tokens.amber : isToday ? tokens.primary : tokens.ink2, bgcolor: warn ? tokens.amberTint : isToday ? tokens.primaryBg : "transparent", borderBottom: onToggle && !open ? 0 : `1px solid ${tokens.divider2}` }}>
        {title}
        {onToggle && <Box component="span" sx={{ fontSize: 12, textTransform: "none", letterSpacing: 0 }}>{open ? "Hide" : "Show"}</Box>}
      </Typography>
      {children}
    </Box>
  );
}

function Row({ it, showDate, canSeeFullPhone, onOpen }: { it: CalItem; showDate?: boolean; canSeeFullPhone: boolean; onOpen: () => void }) {
  const k = KIND[it.kind];
  const l = it.lead;
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, px: 2, py: 1.25, "& + &": { borderTop: `1px solid ${tokens.divider2}` } }}>
      <Typography sx={{ width: showDate ? 92 : 48, flex: "none", fontSize: 14, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
        {showDate ? `${it.at.toLocaleDateString("en-ZA", { day: "numeric", month: "short" })} ${time(it.at)}` : time(it.at)}
      </Typography>
      <Box sx={{ width: 30, height: 30, borderRadius: "50%", bgcolor: k.color, color: "#fff", display: "grid", placeItems: "center", flex: "none" }}>{k.icon}</Box>
      <Box onClick={onOpen} sx={{ flex: 1, minWidth: 0, cursor: "pointer" }}>
        <Typography sx={{ fontSize: 15, fontWeight: 500, color: tokens.primaryDark, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.name}</Typography>
        <Typography sx={{ fontSize: 12.5, color: "text.secondary", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {it.label} · {canSeeFullPhone ? l.phone : maskPhone(l.phone)}
        </Typography>
      </Box>
      {l.phone && (
        <Box
          component="a"
          href={`tel:${l.phone.replace(/\s/g, "")}`}
          onClick={() => logLeadCall(l.id, l.agent_id)}
          aria-label={`Call ${l.name}`}
          sx={{ display: "inline-flex", alignItems: "center", gap: 0.75, bgcolor: tokens.greenCall, color: "#fff", borderRadius: "4px", p: "8px 12px", fontWeight: 500, fontSize: 13, textTransform: "uppercase", textDecoration: "none", flex: "none", "&:hover": { bgcolor: tokens.greenCallHover } }}
        >
          <PhoneIcon sx={{ fontSize: 16 }} />Call
        </Box>
      )}
    </Box>
  );
}

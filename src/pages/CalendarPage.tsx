import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppBar, Box, Button, Dialog, DialogContent, DialogTitle, IconButton, MenuItem, Popover, Select, Skeleton, Toolbar, Typography, useMediaQuery } from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import PhoneIcon from "@mui/icons-material/Phone";
import CloseIcon from "@mui/icons-material/Close";
import ScheduleIcon from "@mui/icons-material/Schedule";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { tokens } from "../theme";
import { useLeads } from "../hooks/useLeads";
import { useCanSeeFullPhone } from "../hooks/useTier";
import { maskPhone } from "../lib/format";
import { logLeadCall } from "../api/leadEvents";
import { calendarItems, DURATION, layoutDay, overdue, weekStart, type CalItem, type CalKind } from "../lib/calendar";

// Calendar, laid out like Google Calendar (what agents already know): Today,
// ‹ ›, the month, Week / Day; days across, hours down, each appointment,
// viewing, picked call time and follow-up a coloured block at its time. Tap a
// block for its details, Call and Open lead. Phones open on Day, like the
// Google Calendar app. The same dates go into Google Calendar when it's
// connected (Get set up).

const HOUR = 48; // px per hour
// Google Calendar's own event colours (Peacock, Grape, Basil, Tomato).
const KIND: Record<CalKind, { color: string; word: string }> = {
  appointment: { color: "#039be5", word: "Appointment" },
  viewing: { color: "#8e24aa", word: "Viewing" },
  call: { color: "#0b8043", word: "Call" },
  followup: { color: "#d50000", word: "Follow up" },
};

const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const hourLabel = (h: number) => (h === 0 ? "" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`);
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export default function CalendarPage() {
  const navigate = useNavigate();
  const phone = useMediaQuery("(max-width:639px)");
  const { data: leads = [], isLoading } = useLeads();
  const canSeeFullPhone = useCanSeeFullPhone();
  const [view, setView] = useState<"week" | "day">(phone ? "day" : "week");
  useEffect(() => { setView(phone ? "day" : "week"); }, [phone]);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const [anchor, setAnchor] = useState(today); // a day in what's shown
  const [open, setOpen] = useState<{ el: HTMLElement; it: CalItem } | null>(null);
  const [showLate, setShowLate] = useState(false);
  const body = useRef<HTMLDivElement>(null);

  const items = useMemo(() => calendarItems(leads), [leads]);
  const late = overdue(items, now);
  const days = view === "week" ? Array.from({ length: 7 }, (_, i) => addDays(weekStart(anchor), i)) : [anchor];
  const step = view === "week" ? 7 : 1;
  const first = days[0];
  const last = days[days.length - 1];
  const title = phone
    ? first.toLocaleDateString("en-ZA", { month: "long" }) // the Google Calendar app shows just the month
    : first.getMonth() === last.getMonth()
    ? first.toLocaleDateString("en-ZA", { month: "long", year: "numeric" })
    : `${first.toLocaleDateString("en-ZA", { month: "short" })} – ${last.toLocaleDateString("en-ZA", { month: "short", year: "numeric" })}`;

  // Start the day scrolled to 7 AM, as Google does.
  useEffect(() => { if (body.current) body.current.scrollTop = 7 * HOUR; }, [view, isLoading]);

  return (
    <Box sx={{ height: "calc(100dvh - var(--ek-nav-h, 0px))", display: "flex", flexDirection: "column" }}>
      <AppBar position="sticky">
        <Toolbar sx={{ height: 56, minHeight: "56px !important", gap: { xs: 0.5, sm: 1 }, px: { xs: 1, sm: 2 } }}>
          <Button variant="outlined" size="small" onClick={() => setAnchor(today)} sx={{ borderRadius: "999px", px: 2, color: "inherit", borderColor: "currentColor", textTransform: "none", fontWeight: 600, minWidth: 0 }}>
            Today
          </Button>
          <IconButton aria-label={view === "week" ? "Previous week" : "Previous day"} onClick={() => setAnchor((a) => addDays(a, -step))} sx={{ color: "inherit" }}><ChevronLeftIcon /></IconButton>
          <IconButton aria-label={view === "week" ? "Next week" : "Next day"} onClick={() => setAnchor((a) => addDays(a, step))} sx={{ color: "inherit", ml: -1 }}><ChevronRightIcon /></IconButton>
          <Typography sx={{ fontSize: { xs: 17, sm: 21 }, fontWeight: 400, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</Typography>
          {late.length > 0 && (
            <Button size="small" onClick={() => setShowLate(true)} sx={{ color: "inherit", textTransform: "none", whiteSpace: "nowrap", minWidth: 0 }}>
              {late.length} {phone ? "late" : "overdue"}
            </Button>
          )}
          <Select size="small" value={view} onChange={(e) => setView(e.target.value as "week" | "day")}
            sx={{ color: "inherit", borderRadius: "999px", ".MuiOutlinedInput-notchedOutline": { borderColor: "currentColor" }, ".MuiSvgIcon-root": { color: "inherit" }, fontSize: 14, minWidth: 92 }}>
            <MenuItem value="day">Day</MenuItem>
            <MenuItem value="week">Week</MenuItem>
          </Select>
        </Toolbar>
      </AppBar>

      {isLoading ? (
        <Box sx={{ p: 2 }}><Skeleton variant="rounded" height={480} /></Box>
      ) : (
        <Box ref={body} sx={{ flex: 1, minHeight: 0, overflowY: "auto", bgcolor: "background.paper" }}>
          {/* Day headings: MON 26 … today's number in a blue circle. Inside the
              scroll area (sticky) so they always line up with the columns. */}
          <Box sx={{ display: "flex", borderBottom: `1px solid ${tokens.divider}`, position: "sticky", top: 0, zIndex: 3, bgcolor: "background.paper" }}>
            <Box sx={{ width: 56, flex: "none", display: "flex", alignItems: "flex-end", justifyContent: "flex-end", pr: 1, pb: 0.5, fontSize: 10, color: "text.secondary" }}>GMT+02</Box>
            {days.map((d) => {
              const isToday = sameDay(d, today);
              return (
                <Box key={d.toISOString()} sx={{ flex: 1, minWidth: 0, textAlign: "center", py: 1, borderLeft: `1px solid ${tokens.divider2}` }}>
                  <Typography sx={{ fontSize: 11, fontWeight: 500, color: isToday ? tokens.primary : "text.secondary" }}>
                    {d.toLocaleDateString("en-ZA", { weekday: "short" }).toUpperCase()}
                  </Typography>
                  <Box sx={{ mx: "auto", mt: 0.25, width: 44, height: 44, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 24, bgcolor: isToday ? tokens.primary : "transparent", color: isToday ? tokens.onPrimary : "text.primary" }}>
                    {d.getDate()}
                  </Box>
                </Box>
              );
            })}
          </Box>

          {/* Hours down, days across. */}
          <Box sx={{ display: "flex" }}>
            <Box sx={{ width: 56, flex: "none", position: "relative", height: 24 * HOUR }}>
              {Array.from({ length: 24 }, (_, h) => (
                <Typography key={h} sx={{ position: "absolute", top: h * HOUR - 7, right: 8, fontSize: 10.5, color: "text.secondary" }}>{hourLabel(h)}</Typography>
              ))}
            </Box>
            {days.map((d) => {
              const placed = layoutDay(items.filter((it) => sameDay(it.at, d)));
              const isToday = sameDay(d, today);
              return (
                <Box key={d.toISOString()} sx={{ flex: 1, minWidth: 0, position: "relative", height: 24 * HOUR, borderLeft: `1px solid ${tokens.divider2}`,
                  backgroundImage: `repeating-linear-gradient(to bottom, ${tokens.divider2} 0, ${tokens.divider2} 1px, transparent 1px, transparent ${HOUR}px)` }}>
                  {placed.map((p) => {
                    const k = KIND[p.it.kind];
                    const height = Math.max(20, ((p.end - p.start) / 60) * HOUR - 2);
                    return (
                      <Box
                        key={`${p.it.lead.id}-${p.it.kind}`}
                        component="button"
                        type="button"
                        onClick={(e: React.MouseEvent<HTMLElement>) => setOpen({ el: e.currentTarget, it: p.it })}
                        sx={{
                          position: "absolute", top: (p.start / 60) * HOUR + 1, height,
                          left: `calc(${(p.lane / p.lanes) * 100}% + 2px)`, width: `calc(${100 / p.lanes}% - 6px)`,
                          bgcolor: k.color, color: "#fff", border: 0, borderRadius: "6px", px: 0.75, py: height > 30 ? 0.5 : 0.15,
                          textAlign: "left", font: "inherit", fontSize: 12, lineHeight: 1.25, overflow: "hidden", cursor: "pointer",
                          boxShadow: "0 0 0 1px rgba(255,255,255,.35)", "&:hover": { filter: "brightness(1.08)" },
                        }}
                      >
                        <Box sx={{ fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {k.word}: {p.it.lead.name}
                        </Box>
                        {height > 30 && <Box sx={{ opacity: 0.9, whiteSpace: "nowrap" }}>{clock(p.start)} – {clock(p.end)}</Box>}
                      </Box>
                    );
                  })}
                  {/* Now: Google's red line with a dot. */}
                  {isToday && (
                    <Box sx={{ position: "absolute", left: 0, right: 0, top: ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR, height: 2, bgcolor: "#ea4335", zIndex: 2, pointerEvents: "none",
                      "&::before": { content: '""', position: "absolute", left: -6, top: -5, width: 12, height: 12, borderRadius: "50%", bgcolor: "#ea4335" } }} />
                  )}
                </Box>
              );
            })}
          </Box>
        </Box>
      )}

      {/* An event's card, like Google's: what, when, number, then Call / Open lead. */}
      <Popover open={!!open} anchorEl={open?.el} onClose={() => setOpen(null)} anchorOrigin={{ vertical: "center", horizontal: "right" }} transformOrigin={{ vertical: "center", horizontal: "left" }}
        slotProps={{ paper: { sx: { width: 320, maxWidth: "calc(100vw - 32px)", borderRadius: "12px", p: 2 } } }}>
        {open && <EventCard it={open.it} canSeeFullPhone={canSeeFullPhone} onOpen={() => navigate(`/leads/${open.it.lead.id}`)} onClose={() => setOpen(null)} />}
      </Popover>

      <Dialog open={showLate} onClose={() => setShowLate(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: 17, fontWeight: 600 }}>Overdue follow-ups ({late.length})</DialogTitle>
        <DialogContent sx={{ px: 1.5 }}>
          {late.map((it) => (
            <Box key={`${it.lead.id}-${it.kind}`} sx={{ display: "flex", alignItems: "center", gap: 1, py: 1, px: 1, "& + &": { borderTop: `1px solid ${tokens.divider2}` } }}>
              <Box sx={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => navigate(`/leads/${it.lead.id}`)}>
                <Typography sx={{ fontSize: 14.5, fontWeight: 500, color: tokens.primaryDark }}>{it.lead.name}</Typography>
                <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>
                  {it.at.toLocaleDateString("en-ZA", { day: "numeric", month: "short" })} · {it.label}
                </Typography>
              </Box>
              <CallButton it={it} />
            </Box>
          ))}
        </DialogContent>
      </Dialog>
    </Box>
  );
}

function CallButton({ it }: { it: CalItem }) {
  if (!it.lead.phone) return null;
  return (
    <Button
      component="a"
      href={`tel:${it.lead.phone.replace(/\s/g, "")}`}
      onClick={() => logLeadCall(it.lead.id, it.lead.agent_id)}
      variant="contained"
      size="small"
      startIcon={<PhoneIcon />}
      sx={{ bgcolor: tokens.greenCall, "&:hover": { bgcolor: tokens.greenCallHover }, flex: "none" }}
    >
      Call
    </Button>
  );
}

function EventCard({ it, canSeeFullPhone, onOpen, onClose }: { it: CalItem; canSeeFullPhone: boolean; onOpen: () => void; onClose: () => void }) {
  const k = KIND[it.kind];
  const start = it.at.getHours() * 60 + it.at.getMinutes();
  const end = Math.min(24 * 60, start + DURATION[it.kind]);
  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "flex-end", mt: -1, mr: -1 }}>
        <IconButton size="small" aria-label="Close" onClick={onClose}><CloseIcon fontSize="small" /></IconButton>
      </Box>
      <Box sx={{ display: "flex", gap: 1.5 }}>
        <Box sx={{ width: 14, height: 14, borderRadius: "4px", bgcolor: k.color, mt: "6px", flex: "none" }} />
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 19, lineHeight: 1.3 }}>{k.word}: {it.lead.name}</Typography>
          <Typography sx={{ fontSize: 13.5, color: "text.secondary", mt: 0.25 }}>
            {it.at.toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long" })} · {clock(start)} – {clock(end)}
          </Typography>
        </Box>
      </Box>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75, mt: 1.5, ml: 3.25, fontSize: 13.5 }}>
        <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}><PhoneIcon sx={{ fontSize: 16, color: "text.secondary" }} />{canSeeFullPhone ? it.lead.phone : maskPhone(it.lead.phone)}</Box>
        <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}><ScheduleIcon sx={{ fontSize: 16, color: "text.secondary" }} />{it.label} · {it.lead.stage}</Box>
      </Box>
      <Box sx={{ display: "flex", gap: 1, mt: 2, justifyContent: "flex-end" }}>
        <Button size="small" startIcon={<OpenInNewIcon />} onClick={onOpen}>Open lead</Button>
        <CallButton it={it} />
      </Box>
    </Box>
  );
}

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AppBar, Box, Button, Dialog, Drawer, IconButton, MenuItem, Popover, Select, Skeleton, Toolbar, Typography, useMediaQuery } from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import PhoneIcon from "@mui/icons-material/Phone";
import CloseIcon from "@mui/icons-material/Close";
import ScheduleIcon from "@mui/icons-material/Schedule";
import PersonIcon from "@mui/icons-material/Person";
import { tokens } from "../theme";
import { useLeads } from "../hooks/useLeads";
import { useCanSeeFullPhone } from "../hooks/useTier";
import { maskPhone } from "../lib/format";
import { logLeadCall } from "../api/leadEvents";
import { calendarItems, DURATION, layoutDay, overdue, weekStart, type CalItem, type CalKind } from "../lib/calendar";

// Calendar, laid out like Google Calendar (what agents already know): days
// across, hours down, each appointment, viewing, picked call time and
// follow-up a coloured block at its time.
//   Desktop  Today, ‹ ›, the month, Week / Day. Click a block for a card.
//   Phone    one day at a time under a row of the week's dates (dots = days
//            with something on). ‹ › by the month, or a swipe on the dates,
//            change the week; a swipe on the hours changes the day. Today
//            top right. A block opens a bottom sheet with a big
//            Call button. Overdue follow-ups sit in a bar at the bottom.
// The same dates go into Google Calendar when it's connected (Get set up).
// It keeps its place: the day, Week/Day and the overdue list live in the URL
// (?d=2026-10-27&v=day&late=1) and the scroll in this tab's session, so the
// back arrow on a lead lands where they found it, with that lead highlighted.

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
const minutes = (d: Date) => d.getHours() * 60 + d.getMinutes();
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parseYmd = (v: string | null) => {
  const m = v && /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
};
// Where they were scrolled and which lead they opened (this tab only).
const MEMO = "ek.calendar.memo";
type Memo = { key: string; top: number; lead?: string };
const readMemo = (): Memo | null => { try { return JSON.parse(sessionStorage.getItem(MEMO) || "null"); } catch { return null; } };
const writeMemo = (m: Memo) => { try { sessionStorage.setItem(MEMO, JSON.stringify(m)); } catch { /* private mode */ } };

export default function CalendarPage() {
  const navigate = useNavigate();
  const phone = useMediaQuery("(max-width:639px)");
  const { data: leads = [], isLoading } = useLeads();
  const canSeeFullPhone = useCanSeeFullPhone();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const [params, setParams] = useSearchParams();
  const anchor = parseYmd(params.get("d")) ?? today; // the day picked / a day in the week shown
  const weekView = params.get("v") !== "day"; // desktop only; phones always show a day
  const showLate = params.get("late") === "1";
  // Replace, not push: moving around the calendar isn't a page of its own.
  const setParam = (k: string, v: string | null) => setParams((prev) => {
    const n = new URLSearchParams(prev);
    if (v == null) n.delete(k); else n.set(k, v);
    return n;
  }, { replace: true });
  const setAnchor = (next: Date | ((a: Date) => Date)) => {
    const d = typeof next === "function" ? next(anchor) : next;
    setParam("d", sameDay(d, today) ? null : ymd(d));
  };
  const setWeekView = (w: boolean) => setParam("v", w ? null : "day");
  const setShowLate = (v: boolean) => setParam("late", v ? "1" : null);
  const [open, setOpen] = useState<{ el: HTMLElement; it: CalItem } | null>(null);
  const [memo] = useState(readMemo); // what they had when they left (read once)
  const [flash, setFlash] = useState<string | undefined>(memo?.lead);
  // Used once: opening Calendar from the menu later starts fresh.
  useEffect(() => { try { sessionStorage.removeItem(MEMO); } catch { /* private mode */ } }, []);
  const body = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);

  const HOUR = phone ? 60 : 48; // px per hour: taller on phones so short calls are easy to tap
  const week = !phone && weekView;
  const items = useMemo(() => calendarItems(leads), [leads]);
  const late = overdue(items, now);
  const days = week ? Array.from({ length: 7 }, (_, i) => addDays(weekStart(anchor), i)) : [anchor];
  const step = week ? 7 : 1;
  const first = days[0];
  const last = days[days.length - 1];
  const title = phone
    ? anchor.toLocaleDateString("en-ZA", { month: "long", year: anchor.getFullYear() === today.getFullYear() ? undefined : "numeric" })
    : first.getMonth() === last.getMonth()
    ? first.toLocaleDateString("en-ZA", { month: "long", year: "numeric" })
    : `${first.toLocaleDateString("en-ZA", { month: "short" })} – ${last.toLocaleDateString("en-ZA", { month: "short", year: "numeric" })}`;
  const shownItems = items.filter((it) => days.some((d) => sameDay(it.at, d)));

  // Open where the action is: an hour before the first thing shown, else an
  // hour before now (today), else 8 AM.
  const firstAt = shownItems.length ? Math.min(...shownItems.map((it) => minutes(it.at))) : null;
  const scrollTo = firstAt != null ? firstAt - 60 : days.some((d) => sameDay(d, today)) ? minutes(now) - 60 : 8 * 60;
  const dayKey = days[0].toDateString() + days.length;
  // Coming back to the same day: put them back exactly where they were.
  const restored = useRef(false);
  useEffect(() => {
    if (!body.current || isLoading) return;
    if (!restored.current && memo && memo.key === dayKey) body.current.scrollTop = memo.top;
    else body.current.scrollTop = Math.max(0, (scrollTo / 60) * HOUR);
    restored.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayKey, isLoading, HOUR]);
  // The lead they came back from glows for a moment, then settles.
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(undefined), 2400);
    return () => clearTimeout(t);
  }, [flash]);
  const openLead = (id: string) => {
    writeMemo({ key: dayKey, top: body.current?.scrollTop ?? 0, lead: id });
    navigate(`/leads/${id}`);
  };

  // Swipe left / right = next / previous, like the Google Calendar app: on
  // the hours by `step` (a day on phones), on the row of dates by a week.
  const onTouchStart = (e: React.TouchEvent) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; };
  const swipe = (by: number) => (e: React.TouchEvent) => {
    const t = touch.current; touch.current = null;
    if (!t) return;
    const dx = e.changedTouches[0].clientX - t.x;
    const dy = e.changedTouches[0].clientY - t.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) setAnchor((a) => addDays(a, dx < 0 ? by : -by));
  };
  const onTouchEnd = swipe(step);

  const card = open && (
    <EventCard
      it={open.it}
      phone={phone}
      canSeeFullPhone={canSeeFullPhone}
      onOpen={() => openLead(open.it.lead.id)}
      onClose={() => setOpen(null)}
    />
  );

  return (
    <Box sx={{ height: "calc(100dvh - var(--ek-nav-h, 0px))", display: "flex", flexDirection: "column" }}>
      <AppBar position="sticky">
        {phone ? (
          <Toolbar sx={{ height: 56, minHeight: "56px !important", pl: 2, pr: 1.5, gap: 0.5 }}>
            <Typography sx={{ fontSize: 20, fontWeight: 500, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</Typography>
            <IconButton aria-label="Previous week" onClick={() => setAnchor((a) => addDays(a, -7))} sx={{ color: "inherit", width: 48, height: 48 }}><ChevronLeftIcon /></IconButton>
            <IconButton aria-label="Next week" onClick={() => setAnchor((a) => addDays(a, 7))} sx={{ color: "inherit", width: 48, height: 48, mr: 0.5 }}><ChevronRightIcon /></IconButton>
            <TodayButton onClick={() => setAnchor(today)} />
          </Toolbar>
        ) : (
          <Toolbar sx={{ height: 64, minHeight: "64px !important", gap: 1, px: 2 }}>
            <TodayButton onClick={() => setAnchor(today)} />
            <IconButton aria-label={week ? "Previous week" : "Previous day"} onClick={() => setAnchor((a) => addDays(a, -step))} sx={{ color: "inherit", width: 48, height: 48 }}><ChevronLeftIcon /></IconButton>
            <IconButton aria-label={week ? "Next week" : "Next day"} onClick={() => setAnchor((a) => addDays(a, step))} sx={{ color: "inherit", width: 48, height: 48, ml: -1 }}><ChevronRightIcon /></IconButton>
            <Typography sx={{ fontSize: 21, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</Typography>
            {late.length > 0 && (
              <Button onClick={() => setShowLate(true)} sx={{ color: "inherit", textTransform: "none", whiteSpace: "nowrap" }}>
                {late.length} overdue
              </Button>
            )}
            <Select value={week ? "week" : "day"} onChange={(e) => setWeekView(e.target.value === "week")}
              sx={{ color: "inherit", borderRadius: "999px", height: 40, ".MuiOutlinedInput-notchedOutline": { borderColor: "currentColor" }, ".MuiSvgIcon-root": { color: "inherit" }, fontSize: 14, minWidth: 100 }}>
              <MenuItem value="day">Day</MenuItem>
              <MenuItem value="week">Week</MenuItem>
            </Select>
          </Toolbar>
        )}
      </AppBar>

      {phone && <WeekStrip anchor={anchor} today={today} items={items} onPick={setAnchor} onTouchStart={onTouchStart} onTouchEnd={swipe(7)} />}

      {isLoading ? (
        <Box sx={{ p: 2 }}><Skeleton variant="rounded" height={480} /></Box>
      ) : (
        <Box ref={body} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} sx={{ flex: 1, minHeight: 0, overflowY: "auto", bgcolor: "background.paper", position: "relative" }}>
          {/* Desktop day headings: MON 26 … today's number in a blue circle.
              Inside the scroll area (sticky) so they line up with the columns.
              Phones have the week row above instead. */}
          {!phone && (
            <Box sx={{ display: "flex", borderBottom: `1px solid ${tokens.divider}`, position: "sticky", top: 0, zIndex: 3, bgcolor: "background.paper" }}>
              <Box sx={{ width: 56, flex: "none", display: "flex", alignItems: "flex-end", justifyContent: "flex-end", pr: 1, pb: 0.5, fontSize: 10, color: "text.secondary" }}>GMT+02</Box>
              {days.map((d) => {
                const isToday = sameDay(d, today);
                return (
                  <Box key={d.toISOString()} sx={{ flex: 1, minWidth: 0, textAlign: "center", py: 1, borderLeft: `1px solid ${tokens.divider2}` }}>
                    <Typography sx={{ fontSize: 11, fontWeight: 500, color: isToday ? tokens.primary : "text.secondary" }}>
                      {d.toLocaleDateString("en-ZA", { weekday: "short" }).toUpperCase()}
                    </Typography>
                    <Box
                      component="button"
                      type="button"
                      onClick={() => { setAnchor(d); setWeekView(false); }}
                      aria-label={`Show ${d.toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long" })}`}
                      sx={{ mx: "auto", mt: 0.25, width: 44, height: 44, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 24, font: "inherit", border: 0, cursor: "pointer",
                        bgcolor: isToday ? tokens.primary : "transparent", color: isToday ? tokens.onPrimary : "text.primary", "&:hover": { bgcolor: isToday ? tokens.primary : tokens.divider2 } }}
                    >
                      <Box component="span" sx={{ fontSize: 24 }}>{d.getDate()}</Box>
                    </Box>
                  </Box>
                );
              })}
            </Box>
          )}

          {phone && shownItems.length === 0 && (
            <Typography sx={{ position: "sticky", top: 0, zIndex: 3, textAlign: "center", py: 1, fontSize: 14, color: "text.secondary", bgcolor: "background.paper", borderBottom: `1px solid ${tokens.divider2}` }}>
              Nothing on {sameDay(anchor, today) ? "today" : anchor.toLocaleDateString("en-ZA", { weekday: "long" })}
            </Typography>
          )}

          {/* Hours down, days across. */}
          <Box sx={{ display: "flex", pb: phone && late.length ? 9 : 0 }}>
            <Box sx={{ width: phone ? 48 : 56, flex: "none", position: "relative", height: 24 * HOUR }}>
              {Array.from({ length: 24 }, (_, h) => (
                <Typography key={h} sx={{ position: "absolute", top: h * HOUR - 7, right: 8, fontSize: 10.5, color: "text.secondary", whiteSpace: "nowrap" }}>{hourLabel(h)}</Typography>
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
                    // Never smaller than a comfortable tap, even for a 15-minute call.
                    const height = Math.max(phone ? 40 : 22, ((p.end - p.start) / 60) * HOUR - 2);
                    const roomy = height > 34;
                    return (
                      <Box
                        key={`${p.it.lead.id}-${p.it.kind}`}
                        component="button"
                        type="button"
                        onClick={(e: React.MouseEvent<HTMLElement>) => setOpen({ el: e.currentTarget, it: p.it })}
                        sx={{
                          position: "absolute", top: (p.start / 60) * HOUR + 1, height, zIndex: 1,
                          left: `calc(${(p.lane / p.lanes) * 100}% + 2px)`, width: `calc(${100 / p.lanes}% - 6px)`,
                          bgcolor: k.color, color: "#fff", border: 0, borderRadius: "6px", px: 0.75, py: roomy ? 0.5 : 0.15,
                          textAlign: "left", font: "inherit", fontSize: phone ? 13.5 : 12, lineHeight: 1.25, overflow: "hidden", cursor: "pointer",
                          boxShadow: flash === p.it.lead.id ? `0 0 0 2px #fff, 0 0 0 5px ${k.color}` : "0 0 0 1px rgba(255,255,255,.35)",
                          transition: "box-shadow .6s ease", "&:hover": { filter: "brightness(1.08)" },
                        }}
                      >
                        <Box sx={{ fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {k.word}: {p.it.lead.name}
                        </Box>
                        {roomy && <Box sx={{ opacity: 0.9, whiteSpace: "nowrap" }}>{clock(minutes(p.it.at))}{p.end - p.start >= 30 ? ` – ${clock(p.end)}` : ""}</Box>}
                      </Box>
                    );
                  })}
                  {/* Now: Google's red line with a dot. */}
                  {isToday && (
                    <Box sx={{ position: "absolute", left: 0, right: 0, top: (minutes(now) / 60) * HOUR, height: 2, bgcolor: "#ea4335", zIndex: 2, pointerEvents: "none",
                      "&::before": { content: '""', position: "absolute", left: -6, top: -5, width: 12, height: 12, borderRadius: "50%", bgcolor: "#ea4335" } }} />
                  )}
                </Box>
              );
            })}
          </Box>
        </Box>
      )}

      {/* Phones: overdue follow-ups in the thumb zone, plain words. */}
      {phone && late.length > 0 && (
        <Box sx={{ position: "fixed", left: 12, right: 12, bottom: "calc(var(--ek-nav-h, 0px) + 12px)", zIndex: 5 }}>
          <Button fullWidth onClick={() => setShowLate(true)}
            sx={{ minHeight: 52, borderRadius: "12px", bgcolor: "#fce8e6", color: "#a50e0e", fontSize: 15, fontWeight: 600, textTransform: "none", justifyContent: "space-between", px: 2, boxShadow: 2, "&:hover": { bgcolor: "#fad2cf" } }}
            endIcon={<ChevronRightIcon />}>
            {late.length} follow-up{late.length === 1 ? " is" : "s are"} overdue
          </Button>
        </Box>
      )}

      {/* An event's details: a card by the block on desktop, a bottom sheet on phones. */}
      {phone ? (
        <Sheet open={!!open} onClose={() => setOpen(null)}>{card}</Sheet>
      ) : (
        <Popover open={!!open} anchorEl={open?.el} onClose={() => setOpen(null)} anchorOrigin={{ vertical: "center", horizontal: "right" }} transformOrigin={{ vertical: "center", horizontal: "left" }}
          slotProps={{ paper: { sx: { width: 340, maxWidth: "calc(100vw - 32px)", borderRadius: "12px", p: 2 } } }}>
          {card}
        </Popover>
      )}

      <Sheet open={showLate} onClose={() => setShowLate(false)} phone={phone}>
        <Box sx={{ display: "flex", alignItems: "center", mb: 1 }}>
          <Typography sx={{ fontSize: 18, fontWeight: 600, flex: 1 }}>Overdue follow-ups ({late.length})</Typography>
          <IconButton aria-label="Close" onClick={() => setShowLate(false)} sx={{ width: 48, height: 48, mr: -1 }}><CloseIcon /></IconButton>
        </Box>
        {late.map((it) => (
          <Box key={`${it.lead.id}-${it.kind}`} sx={{ display: "flex", alignItems: "center", gap: 1, py: 1, px: 1, mx: -1, borderRadius: "8px", transition: "background-color .6s ease", bgcolor: flash === it.lead.id ? tokens.divider2 : "transparent", "& + &": { borderTop: `1px solid ${tokens.divider2}` } }}>
            <Box component="button" type="button" onClick={() => openLead(it.lead.id)}
              sx={{ flex: 1, minWidth: 0, minHeight: 48, textAlign: "left", font: "inherit", bgcolor: "transparent", border: 0, p: 0, cursor: "pointer" }}>
              <Typography sx={{ fontSize: 16, fontWeight: 500, color: tokens.primaryDark }}>{it.lead.name}</Typography>
              <Typography sx={{ fontSize: 13.5, color: "text.secondary" }}>
                Was due {it.at.toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" })} · {it.label}
              </Typography>
            </Box>
            <CallButton it={it} />
          </Box>
        ))}
      </Sheet>
    </Box>
  );
}

function TodayButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="outlined" onClick={onClick}
      sx={{ borderRadius: "999px", px: 2, height: 40, color: "inherit", borderColor: "currentColor", textTransform: "none", fontWeight: 600, fontSize: 15 }}>
      Today
    </Button>
  );
}

/** Phones: the week's dates in a row, M T W T F S S, a dot under days with
 *  something on. Tap a date to see it; swipe for the next / previous week. */
function WeekStrip({ anchor, today, items, onPick, onTouchStart, onTouchEnd }: {
  anchor: Date; today: Date; items: CalItem[]; onPick: (d: Date) => void;
  onTouchStart: (e: React.TouchEvent) => void; onTouchEnd: (e: React.TouchEvent) => void;
}) {
  const start = weekStart(anchor);
  return (
    <Box onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} sx={{ display: "flex", px: 0.5, py: 0.5, bgcolor: "background.paper", borderBottom: `1px solid ${tokens.divider}` }}>
      {Array.from({ length: 7 }, (_, i) => {
        const d = addDays(start, i);
        const picked = sameDay(d, anchor);
        const isToday = sameDay(d, today);
        const busy = items.some((it) => sameDay(it.at, d));
        return (
          <Box key={i} component="button" type="button" onClick={() => onPick(d)}
            aria-label={d.toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long" })}
            aria-pressed={picked}
            sx={{ flex: 1, minHeight: 64, display: "flex", flexDirection: "column", alignItems: "center", gap: 0.25, bgcolor: "transparent", border: 0, font: "inherit", cursor: "pointer", p: 0 }}>
            <Typography component="span" sx={{ fontSize: 12, fontWeight: 500, color: isToday ? tokens.primary : "text.secondary" }}>
              {d.toLocaleDateString("en-ZA", { weekday: "narrow" })}
            </Typography>
            <Box component="span" sx={{ width: 36, height: 36, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 17, fontWeight: picked ? 600 : 400,
              bgcolor: picked ? tokens.primary : "transparent", color: picked ? tokens.onPrimary : isToday ? tokens.primary : "text.primary" }}>
              {d.getDate()}
            </Box>
            <Box component="span" sx={{ width: 5, height: 5, borderRadius: "50%", bgcolor: busy ? "text.secondary" : "transparent" }} />
          </Box>
        );
      })}
    </Box>
  );
}

/** A bottom sheet on phones, a dialog on desktop (as OutcomeSheet does). */
function Sheet({ open, onClose, phone = true, children }: { open: boolean; onClose: () => void; phone?: boolean; children: ReactNode }) {
  if (!phone) {
    return <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth slotProps={{ paper: { sx: { p: 2.5 } } }}>{children}</Dialog>;
  }
  return (
    <Drawer anchor="bottom" open={open} onClose={onClose}
      slotProps={{ paper: { sx: { borderRadius: "16px 16px 0 0", maxWidth: 480, mx: "auto", maxHeight: "85dvh", px: 2, pt: 1, pb: "calc(16px + env(safe-area-inset-bottom, 0px))" } } }}>
      <Box sx={{ width: 36, height: 4, borderRadius: 2, bgcolor: tokens.divider, mx: "auto", mb: 1.5 }} />
      {children}
    </Drawer>
  );
}

function CallButton({ it, big }: { it: CalItem; big?: boolean }) {
  if (!it.lead.phone) return null;
  return (
    <Button
      component="a"
      href={`tel:${it.lead.phone.replace(/\s/g, "")}`}
      onClick={() => logLeadCall(it.lead.id, it.lead.agent_id)}
      variant="contained"
      startIcon={<PhoneIcon />}
      fullWidth={big}
      sx={{ bgcolor: tokens.greenCall, "&:hover": { bgcolor: tokens.greenCallHover }, flex: "none", minHeight: big ? 52 : 44, fontSize: big ? 16 : 14 }}
    >
      Call{big ? ` ${it.lead.name.split(" ")[0]}` : ""}
    </Button>
  );
}

function EventCard({ it, phone, canSeeFullPhone, onOpen, onClose }: { it: CalItem; phone: boolean; canSeeFullPhone: boolean; onOpen: () => void; onClose: () => void }) {
  const k = KIND[it.kind];
  const start = minutes(it.at);
  const end = Math.min(24 * 60, start + DURATION[it.kind]);
  return (
    <Box>
      <Box sx={{ display: "flex", gap: 1.5, alignItems: "flex-start" }}>
        <Box sx={{ width: 14, height: 14, borderRadius: "4px", bgcolor: k.color, mt: "8px", flex: "none" }} />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography sx={{ fontSize: 20, lineHeight: 1.3 }}>{k.word}: {it.lead.name}</Typography>
          <Typography sx={{ fontSize: 14.5, color: "text.secondary", mt: 0.25 }}>
            {it.at.toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long" })} · {clock(start)}{it.kind === "call" ? "" : ` – ${clock(end)}`}
          </Typography>
        </Box>
        <IconButton aria-label="Close" onClick={onClose} sx={{ width: 44, height: 44, mt: -1, mr: -1 }}><CloseIcon /></IconButton>
      </Box>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1, mt: 1.5, ml: 3.25, fontSize: 15 }}>
        <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}><PhoneIcon sx={{ fontSize: 18, color: "text.secondary" }} />{canSeeFullPhone ? it.lead.phone : maskPhone(it.lead.phone)}</Box>
        <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}><ScheduleIcon sx={{ fontSize: 18, color: "text.secondary" }} />{it.label}</Box>
      </Box>
      {phone ? (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1, mt: 2.5 }}>
          <CallButton it={it} big />
          <Button variant="outlined" fullWidth startIcon={<PersonIcon />} onClick={onOpen} sx={{ minHeight: 52, fontSize: 16 }}>Open lead</Button>
        </Box>
      ) : (
        <Box sx={{ display: "flex", gap: 1, mt: 2, justifyContent: "flex-end" }}>
          <Button startIcon={<PersonIcon />} onClick={onOpen}>Open lead</Button>
          <CallButton it={it} />
        </Box>
      )}
    </Box>
  );
}

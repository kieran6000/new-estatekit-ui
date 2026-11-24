import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AppBar, Box, Button, Chip, Dialog, Drawer, IconButton, MenuItem, Popover, Select, Skeleton, TextField, Toolbar, Typography, useMediaQuery } from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import PhoneIcon from "@mui/icons-material/Phone";
import CloseIcon from "@mui/icons-material/Close";
import ScheduleIcon from "@mui/icons-material/Schedule";
import PersonIcon from "@mui/icons-material/Person";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import VideocamIcon from "@mui/icons-material/Videocam";
import BlockIcon from "@mui/icons-material/Block";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlineOutlined";
import EventBusyIcon from "@mui/icons-material/EventBusy";
import ScheduleSendIcon from "@mui/icons-material/ScheduleSend";
import { tokens } from "../theme";
import { PITCH_HOSTS } from "../lib/pitchHosts";
import { useLeads } from "../hooks/useLeads";
import { useCanSeeFullPhone } from "../hooks/useTier";
import { useConnectGoogleCalendar, useGoogleCalendarReturn, useGoogleCalendarStatus, useGoogleEvents } from "../hooks/useGoogleCalendar";
import { useIsOperator } from "../hooks/useAutomations";
import { useFunnelBlockActions, useFunnelBookingActions, useFunnelCalendar } from "../hooks/useBookingAdmin";
import { useSnack } from "../hooks/useSnack";
import { maskPhone, telHref } from "../lib/format";
import { logLeadCall } from "../api/leadEvents";
import type { GoogleEvent } from "../api/googleCalendar";
import type { FunnelBlock, FunnelBooking } from "../api/bookingAdmin";
import GoogleCalendarIcon from "../components/GoogleCalendarIcon";
import LeadDetailPage from "./LeadDetailPage";
import { allDayCovers, calendarItems, DURATION, KIND_STYLE, layoutBlocks, overdue, spanOnDay, syncKind, weekStart, type CalItem } from "../lib/calendar";
import { prettyPhone } from "../lib/phone";

// Calendar, laid out like Google Calendar (what agents already know): days
// across, hours down, each appointment, viewing, picked call time and
// follow-up a coloured block at its time.
//   Desktop  Today, ‹ ›, the month, Week / Day. Click a block for a card.
//   Phone    one day at a time under a row of the week's dates (dots = days
//            with something on). ‹ › by the month, or a swipe on the dates,
//            change the week; a swipe on the hours changes the day. Today
//            top right. A block opens a bottom sheet with a big
//            Call button. Overdue follow-ups sit in a bar at the bottom.
// With Google Calendar connected (Account), the same entries are in their
// Google Calendar (a card links to it), and their own Google events show here
// too, in grey, so the whole day is in one place. Only the signed-in person's
// own: never an account an operator is switched into.
// It keeps its place: the day, Week/Day and the overdue list live in the URL
// (?d=2026-10-27&v=day&late=1) and the scroll in this tab's session, so the
// back arrow on a lead lands where they found it, with that lead highlighted.

const KIND = KIND_STYLE;
// The funnel's own discovery calls: a colour of their own, apart from the lead
// kinds, so staff can tell an estatekit.co/pitch call from a client's at a glance.
const FUNNEL_COLOR = "#3949ab";

const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const SNAP = 15; // minutes a drag snaps to, like Google Calendar
const clampMin = (m: number) => Math.max(0, Math.min(24 * 60, m));
const snapMin = (m: number) => Math.round(m / SNAP) * SNAP;
// The UTC instant for a wall-clock minute-of-day on a given date (local = the
// dashboard's time zone, which for staff is the funnel's Africa/Johannesburg).
const isoDayMin = (day: Date, m: number) =>
  new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(m / 60), m % 60).toISOString();
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

/** What a tap opened: one of ours, one of their own Google events, a funnel
 *  booking, or a blocked-off time (the last two: operators only). */
type Opened =
  | { el: HTMLElement; it: CalItem; g?: undefined; fb?: undefined; bl?: undefined }
  | { el: HTMLElement; g: GoogleEvent; it?: undefined; fb?: undefined; bl?: undefined }
  | { el: HTMLElement; fb: FunnelBooking; it?: undefined; g?: undefined; bl?: undefined }
  | { el: HTMLElement; bl: FunnelBlock; it?: undefined; g?: undefined; fb?: undefined };

// A drag in progress on the grid (desktop, operators only): dragging on empty
// space makes a block, dragging a block moves it, its edges resize it, and
// dragging a funnel booking reschedules it. `init` is what we grabbed; the
// preview band follows the pointer; on release we commit.
type DragInit =
  | { mode: "create"; dayIdx: number }
  | { mode: "move-booking"; id: string; dayIdx: number; dur: number; startMin: number }
  | { mode: "move-block"; id: string; dayIdx: number; dur: number; startMin: number; note: string }
  | { mode: "resize-block"; id: string; dayIdx: number; fixed: number; edge: "top" | "bottom"; note: string };
type Preview =
  | { kind: "range"; dayIdx: number; a: number; b: number; label: string }
  | { kind: "move"; dayIdx: number; top: number; dur: number; booking: boolean };

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
  const [open, setOpen] = useState<Opened | null>(null);
  const [memo] = useState(readMemo); // what they had when they left (read once)
  const [flash, setFlash] = useState<string | undefined>(memo?.lead);
  // Used once: opening Calendar from the menu later starts fresh.
  useEffect(() => { try { sessionStorage.removeItem(MEMO); } catch { /* private mode */ } }, []);
  const body = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const [drag, setDrag] = useState<Preview | null>(null);
  const justDragged = useRef(false); // a drag ended — swallow the click that follows
  const [rebook, setRebook] = useState<FunnelBooking | null>(null); // phone "change time" sheet

  // Google Calendar: back from connecting, the connection, and their own events.
  useGoogleCalendarReturn();
  const { status: gStatus, managingOther } = useGoogleCalendarStatus();
  const { connect: connectGoogle, busy: connectingGoogle } = useConnectGoogleCalendar("/calendar");
  const gOn = !!gStatus?.connected && !gStatus.needsReconnect && !managingOther;
  const gFrom = weekStart(anchor);
  const { data: gWin } = useGoogleEvents(gFrom, addDays(gFrom, 7), gOn);
  const gEvents = useMemo(() => (gOn ? gWin?.events ?? [] : []), [gOn, gWin]);
  const syncedLink = useMemo(
    () => new Map((gOn ? gWin?.synced ?? [] : []).map((s) => [`${s.lead_id}:${s.kind}`, s.html_link])),
    [gOn, gWin],
  );
  const offerGoogle = !managingOther && !!gStatus?.ready && (!gStatus.connected || gStatus.needsReconnect);

  // The funnel's own diary (estatekit.co/pitch discovery calls + blocked
  // times): staff only, and only on their own calendar — never mixed into a
  // client's when switched in.
  const { data: isOperator } = useIsOperator();
  const showFunnel = isOperator === true && !managingOther;
  const { data: funnel } = useFunnelCalendar(gFrom, addDays(gFrom, 7), showFunnel);
  const { block: blockMut, unblock: unblockMut, moveBlock: moveBlockMut } = useFunnelBlockActions();
  const { reschedule: rescheduleMut, cancel: cancelMut, setHosts: setHostsMut } = useFunnelBookingActions();
  const showSnack = useSnack();
  const bookings = useMemo(() => (showFunnel ? funnel?.bookings ?? [] : []), [showFunnel, funnel]);
  const blocks = useMemo(() => (showFunnel ? funnel?.blocks ?? [] : []), [showFunnel, funnel]);
  // A funnel booking already shows the lead's appointment; don't draw it twice.
  const bookedLeadIds = useMemo(() => new Set(bookings.map((b) => b.lead_id).filter(Boolean) as string[]), [bookings]);
  const [blockOff, setBlockOff] = useState(false);

  const HOUR = phone ? 60 : 48; // px per hour: taller on phones so short calls are easy to tap
  const week = !phone && weekView;
  const items = useMemo(
    () => calendarItems(leads).filter((it) => !(it.kind === "appointment" && bookedLeadIds.has(it.lead.id))),
    [leads, bookedLeadIds],
  );
  const late = overdue(items, now);
  const bookingsOn = (d: Date) => bookings.map((b) => ({ b, span: spanOnDay(b.starts_at, b.ends_at, d) })).filter((x) => x.span);
  const blocksOn = (d: Date) => blocks.map((bl) => ({ bl, span: spanOnDay(bl.start, bl.end, d) })).filter((x) => x.span);
  const removeBlock = (id: string) => {
    setOpen(null);
    unblockMut.mutate(id, { onError: () => showSnack("Couldn't remove that block. Try again.") });
  };
  const submitBlock = (startsAt: string, endsAt: string, note: string) => {
    blockMut.mutate({ startsAt, endsAt, note: note || undefined }, {
      onSuccess: () => { setBlockOff(false); showSnack("Time blocked off. The funnel won't offer it."); },
      onError: (e) => showSnack((e as Error).message || "Couldn't block off that time."),
    });
  };
  const days = week ? Array.from({ length: 7 }, (_, i) => addDays(weekStart(anchor), i)) : [anchor];
  const step = week ? 7 : 1;
  const first = days[0];
  const last = days[days.length - 1];

  // ── Google-Calendar-style dragging (desktop, operators only) ────────────
  // Drag empty space → block it off; drag a block → move it; its top/bottom
  // edges → resize; drag a funnel booking → reschedule. Snaps to 15 minutes.
  const startDrag = (e: React.PointerEvent, init: DragInit) => {
    if (phone || e.button !== 0 || !showFunnel || !grid.current) return;
    e.preventDefault();
    const cols = days.map((_, i) => {
      const el = grid.current!.querySelector(`[data-daycol="${i}"]`) as HTMLElement | null;
      return { idx: i, r: el?.getBoundingClientRect() };
    }).filter((c): c is { idx: number; r: DOMRect } => !!c.r);
    const top0 = cols[0]?.r.top ?? 0;
    const minAt = (cy: number) => clampMin(snapMin(((cy - top0) / HOUR) * 60));
    const dayAt = (cx: number) => cols.find((c) => cx >= c.r.left && cx < c.r.right)?.idx ?? init.dayIdx;
    const downMin = minAt(e.clientY);
    const grab = "startMin" in init ? downMin - init.startMin : 0;
    let moved = false;
    let cur: Preview | null = null;
    const update = (cy: number, cx: number) => {
      const m = minAt(cy);
      if (init.mode === "create") {
        const a = Math.min(downMin, m), b = Math.max(downMin + SNAP, m);
        cur = { kind: "range", dayIdx: dayAt(cx), a, b, label: `${clock(a)} – ${clock(b)}` };
      } else if (init.mode === "resize-block") {
        const a = init.edge === "top" ? Math.min(init.fixed - SNAP, m) : init.fixed;
        const b = init.edge === "top" ? init.fixed : Math.max(init.fixed + SNAP, m);
        cur = { kind: "range", dayIdx: init.dayIdx, a: clampMin(a), b: clampMin(b), label: `${clock(a)} – ${clock(b)}` };
      } else {
        const top = Math.max(0, Math.min(24 * 60 - init.dur, m - grab));
        cur = { kind: "move", dayIdx: dayAt(cx), top, dur: init.dur, booking: init.mode === "move-booking" };
      }
      setDrag(cur);
    };
    const onMove = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < 4) return;
      moved = true;
      justDragged.current = true;
      document.body.style.userSelect = "none";
      update(ev.clientY, ev.clientX);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.userSelect = "";
      setDrag(null);
      if (!moved || !cur) return;
      const c = cur, day = days[c.dayIdx];
      if (c.kind === "range") {
        if (c.b - c.a < SNAP) return;
        if (init.mode === "create") {
          submitBlock(isoDayMin(day, c.a), isoDayMin(day, c.b), "");
        } else {
          moveBlockMut.mutate({ eventId: init.id, startsAt: isoDayMin(day, c.a), endsAt: isoDayMin(day, c.b), note: (init as { note: string }).note },
            { onError: () => showSnack("Couldn't move that block. Try again.") });
        }
      } else if (init.mode === "move-block") {
        moveBlockMut.mutate({ eventId: init.id, startsAt: isoDayMin(day, c.top), endsAt: isoDayMin(day, c.top + c.dur), note: init.note },
          { onError: () => showSnack("Couldn't move that block. Try again.") });
      } else if (init.mode === "move-booking") {
        const startsAt = isoDayMin(day, c.top);
        rescheduleMut.mutate({ bookingId: init.id, startsAt }, {
          onSuccess: () => showSnack("Call moved. The new time is in their diary."),
          onError: (err) => showSnack((err as Error).message || "Couldn't move that call."),
        });
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const cancelBooking = (b: FunnelBooking) => {
    setOpen(null); setRebook(null);
    cancelMut.mutate(b.id, {
      onSuccess: () => showSnack("Call cancelled and taken out of the diary."),
      onError: (e) => showSnack((e as Error).message || "Couldn't cancel that call."),
    });
  };
  const submitRebook = (b: FunnelBooking, startsAt: string) => {
    rescheduleMut.mutate({ bookingId: b.id, startsAt }, {
      onSuccess: () => { setRebook(null); showSnack("Call moved. The new time is in their diary."); },
      onError: (e) => showSnack((e as Error).message || "Couldn't move that call."),
    });
  };
  const title = phone
    ? anchor.toLocaleDateString("en-ZA", { month: "long", year: anchor.getFullYear() === today.getFullYear() ? undefined : "numeric" })
    : first.getMonth() === last.getMonth()
    ? first.toLocaleDateString("en-ZA", { month: "long", year: "numeric" })
    : `${first.toLocaleDateString("en-ZA", { month: "short" })} – ${last.toLocaleDateString("en-ZA", { month: "short", year: "numeric" })}`;
  const shownItems = items.filter((it) => days.some((d) => sameDay(it.at, d)));
  const allDayOn = (d: Date) => gEvents.filter((e) => e.allDay && allDayCovers(e.start, e.end, d));
  const timedOn = (d: Date) => gEvents.filter((e) => !e.allDay).map((e) => ({ e, span: spanOnDay(e.start, e.end, d) })).filter((x) => x.span);
  const shownAllDay = days.some((d) => allDayOn(d).length > 0);
  const gStarts = days.flatMap((d) => timedOn(d).map((x) => x.span!.start));
  const bStarts = days.flatMap((d) => bookingsOn(d).map((x) => x.span!.start));

  // Open where the action is: an hour before the first thing shown, else an
  // hour before now (today), else 8 AM.
  const starts = [...shownItems.map((it) => minutes(it.at)), ...gStarts, ...bStarts];
  const firstAt = starts.length ? Math.min(...starts) : null;
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
  // A lead opens in the side panel (?lead=…), as on Leads. Each opening is a
  // history step, so the phone's Back button closes it. ↑ ↓ step through what
  // they opened it from: the days on screen in time order, or the overdue list.
  const panelLead = params.get("lead");
  const [panelFrom, setPanelFrom] = useState<"cal" | "late">("cal");
  const openLead = (id: string, from: "cal" | "late" = "cal") => {
    writeMemo({ key: dayKey, top: body.current?.scrollTop ?? 0, lead: id });
    setPanelFrom(from);
    setOpen(null);
    setParams((cur) => { const n = new URLSearchParams(cur); n.set("lead", id); return n; });
  };
  const panelIds = Array.from(new Set((panelFrom === "late" ? late : [...shownItems].sort((a, b) => +a.at - +b.at)).map((it) => it.lead.id)));
  const panelPos = (() => { if (!panelLead) return null; const i = panelIds.indexOf(panelLead); return i < 0 ? null : { i, n: panelIds.length }; })();
  const stepLead = (d: 1 | -1) => {
    const next = panelIds[panelIds.indexOf(panelLead ?? "") + d];
    if (!next) return;
    setParam("lead", next);
    document.querySelector(`[data-cal-lead="${next}"]`)?.scrollIntoView({ block: "nearest" });
  };
  const closeLead = () => { if ((window.history.state?.idx ?? 0) > 0) navigate(-1); else setParam("lead", null); };

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

  const card = open?.it ? (
    <EventCard
      it={open.it}
      phone={phone}
      canSeeFullPhone={canSeeFullPhone}
      googleLink={syncedLink.get(`${open.it.lead.id}:${syncKind(open.it.kind)}`)}
      onOpen={() => openLead(open.it.lead.id)}
      onClose={() => setOpen(null)}
    />
  ) : open?.g ? (
    <GoogleEventCard ev={open.g} phone={phone} onClose={() => setOpen(null)} />
  ) : open?.fb ? (
    <FunnelBookingCard b={open.fb} phone={phone} canSeeFullPhone={canSeeFullPhone}
      onOpen={open.fb.lead_id ? () => openLead(open.fb!.lead_id!) : undefined}
      onReschedule={showFunnel && phone ? () => { const fb = open.fb!; setOpen(null); setRebook(fb); } : undefined}
      onCancel={showFunnel ? () => cancelBooking(open.fb!) : undefined}
      canceling={cancelMut.isPending}
      onSetHosts={showFunnel ? (hosts) => setHostsMut.mutate({ bookingId: open.fb!.id, hosts }) : undefined}
      settingHosts={setHostsMut.isPending}
      onClose={() => setOpen(null)} />
  ) : open?.bl ? (
    <BlockedCard bl={open.bl} phone={phone} onRemove={() => removeBlock(open.bl!.id)} removing={unblockMut.isPending} onClose={() => setOpen(null)} />
  ) : null;

  const allDayChip = (e: GoogleEvent) => (
    <Box key={e.id} component="button" type="button" onClick={(ev: React.MouseEvent<HTMLElement>) => setOpen({ el: ev.currentTarget, g: e })}
      sx={{ display: "block", width: "100%", minHeight: phone ? 32 : 22, textAlign: "left", font: "inherit", fontSize: phone ? 13.5 : 12, lineHeight: 1.3,
        px: 0.75, py: 0.25, borderRadius: "6px", cursor: "pointer", color: "text.primary", bgcolor: tokens.surface2,
        border: `1px solid ${tokens.divider}`, borderLeft: `4px solid ${tokens.outline}`, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        "&:hover": { bgcolor: tokens.hover } }}>
      {e.title}
    </Box>
  );

  return (
    <Box sx={{ height: "calc(100dvh - var(--ek-nav-h, 0px))", display: "flex", flexDirection: "column" }}>
      <AppBar position="sticky">
        {phone ? (
          <Toolbar sx={{ height: 56, minHeight: "56px !important", pl: 2, pr: 1.5, gap: 0.5 }}>
            <Typography sx={{ fontSize: 20, fontWeight: 500, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</Typography>
            <IconButton aria-label="Previous week" onClick={() => setAnchor((a) => addDays(a, -7))} sx={{ color: "inherit", width: 48, height: 48 }}><ChevronLeftIcon /></IconButton>
            <IconButton aria-label="Next week" onClick={() => setAnchor((a) => addDays(a, 7))} sx={{ color: "inherit", width: 48, height: 48, mr: 0.5 }}><ChevronRightIcon /></IconButton>
            {showFunnel && (
              <IconButton aria-label="Block off time" onClick={() => setBlockOff(true)} sx={{ color: "inherit", width: 48, height: 48 }}><BlockIcon /></IconButton>
            )}
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
            {showFunnel && (
              <Button variant="outlined" onClick={() => setBlockOff(true)} startIcon={<BlockIcon sx={{ fontSize: 18 }} />}
                sx={{ borderRadius: "999px", px: 2, height: 40, color: "inherit", borderColor: "currentColor", textTransform: "none", fontWeight: 500, fontSize: 14, whiteSpace: "nowrap" }}>
                Block off
              </Button>
            )}
            {offerGoogle && (
              <Button variant="outlined" onClick={connectGoogle} disabled={connectingGoogle} startIcon={<GoogleCalendarIcon size={18} />}
                sx={{ borderRadius: "999px", px: 2, height: 40, whiteSpace: "nowrap", textTransform: "none", fontWeight: 500, fontSize: 14,
                  color: gStatus?.needsReconnect ? tokens.amber : "inherit", borderColor: gStatus?.needsReconnect ? tokens.amberBorder : "currentColor" }}>
                {gStatus?.needsReconnect ? "Reconnect Google Calendar" : "Connect Google Calendar"}
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

      {phone && (
        <WeekStrip anchor={anchor} today={today} busy={(d) => items.some((it) => sameDay(it.at, d)) || allDayOn(d).length > 0 || timedOn(d).length > 0 || bookingsOn(d).length > 0 || blocksOn(d).length > 0}
          onPick={setAnchor} onTouchStart={onTouchStart} onTouchEnd={swipe(7)} />
      )}
      {/* Phones: the day's all-day Google events, above the hours. */}
      {phone && allDayOn(anchor).length > 0 && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, px: 1.5, py: 0.75, bgcolor: "background.paper", borderBottom: `1px solid ${tokens.divider}` }}>
          {allDayOn(anchor).map(allDayChip)}
        </Box>
      )}

      {isLoading ? (
        <Box sx={{ p: 2 }}><Skeleton variant="rounded" height={480} /></Box>
      ) : (
        <Box ref={body} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} sx={{ flex: 1, minHeight: 0, overflowY: "auto", bgcolor: "background.paper", position: "relative" }}>
          {/* Desktop day headings: MON 26 … today's number in a blue circle,
              then any all-day Google events. Inside the scroll area (sticky)
              so they line up with the columns. Phones have the week row above. */}
          {!phone && (
            <Box sx={{ position: "sticky", top: 0, zIndex: 3, bgcolor: "background.paper", borderBottom: `1px solid ${tokens.divider}` }}>
              <Box sx={{ display: "flex" }}>
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
              {shownAllDay && (
                <Box sx={{ display: "flex", borderTop: `1px solid ${tokens.divider2}` }}>
                  <Box sx={{ width: 56, flex: "none" }} />
                  {days.map((d) => (
                    <Box key={d.toISOString()} sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 0.25, p: 0.25, borderLeft: `1px solid ${tokens.divider2}` }}>
                      {allDayOn(d).map(allDayChip)}
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          )}

          {phone && shownItems.length === 0 && timedOn(anchor).length === 0 && allDayOn(anchor).length === 0 && bookingsOn(anchor).length === 0 && blocksOn(anchor).length === 0 && (
            <Typography sx={{ position: "sticky", top: 0, zIndex: 3, textAlign: "center", py: 1, fontSize: 14, color: "text.secondary", bgcolor: "background.paper", borderBottom: `1px solid ${tokens.divider2}` }}>
              Nothing on {sameDay(anchor, today) ? "today" : anchor.toLocaleDateString("en-ZA", { weekday: "long" })}
            </Typography>
          )}

          {/* Hours down, days across. */}
          <Box ref={grid} sx={{ display: "flex", pb: phone && late.length ? 9 : 0 }}>
            <Box sx={{ width: phone ? 48 : 56, flex: "none", position: "relative", height: 24 * HOUR }}>
              {Array.from({ length: 24 }, (_, h) => (
                <Typography key={h} sx={{ position: "absolute", top: h * HOUR - 7, right: 8, fontSize: 10.5, color: "text.secondary", whiteSpace: "nowrap" }}>{hourLabel(h)}</Typography>
              ))}
            </Box>
            {days.map((d, dayIndex) => {
              // Ours and theirs share the width where they overlap, as in Google.
              const placed = layoutBlocks([
                ...items.filter((it) => sameDay(it.at, d)).map((it) => {
                  const start = minutes(it.at);
                  return { key: `${it.lead.id}-${it.kind}`, start, end: Math.min(24 * 60, start + DURATION[it.kind]), it, g: undefined as GoogleEvent | undefined, fb: undefined as FunnelBooking | undefined };
                }),
                ...timedOn(d).map(({ e, span }) => ({ key: `g-${e.id}`, start: span!.start, end: span!.end, it: undefined as CalItem | undefined, g: e, fb: undefined as FunnelBooking | undefined })),
                ...bookingsOn(d).map(({ b, span }) => ({ key: `b-${b.id}`, start: span!.start, end: span!.end, it: undefined as CalItem | undefined, g: undefined as GoogleEvent | undefined, fb: b })),
              ]);
              const bands = blocksOn(d);
              const isToday = sameDay(d, today);
              const canDrag = showFunnel && !phone;
              return (
                <Box key={d.toISOString()} data-daycol={dayIndex}
                  onPointerDown={canDrag ? (e: React.PointerEvent) => { if (e.target === e.currentTarget) startDrag(e, { mode: "create", dayIdx: dayIndex }); } : undefined}
                  sx={{ flex: 1, minWidth: 0, position: "relative", height: 24 * HOUR, borderLeft: `1px solid ${tokens.divider2}`,
                  cursor: canDrag ? "cell" : "default",
                  backgroundImage: `repeating-linear-gradient(to bottom, ${tokens.divider2} 0, ${tokens.divider2} 1px, transparent 1px, transparent ${HOUR}px)` }}>
                  {/* Blocked-off times: a faded hatched band the width of the day,
                      behind everything. The funnel won't offer these. Drag it to
                      move it, its edges to resize (desktop, operators). */}
                  {bands.map(({ bl, span }) => {
                    const height = Math.max(phone ? 32 : 18, ((span!.end - span!.start) / 60) * HOUR - 2);
                    const whole = span!.start === minutes(new Date(bl.start)); // block starts this day (not spilling over)
                    const dur = Math.round((new Date(bl.end).getTime() - new Date(bl.start).getTime()) / 60000);
                    return (
                      <Box key={`bl-${bl.id}`} component="button" type="button" aria-label="Blocked off"
                        onPointerDown={canDrag && whole ? (e: React.PointerEvent) => { e.stopPropagation(); startDrag(e, { mode: "move-block", id: bl.id, dayIdx: dayIndex, dur, startMin: span!.start, note: bl.note }); } : undefined}
                        onClick={(e: React.MouseEvent<HTMLElement>) => { if (justDragged.current) { justDragged.current = false; return; } setOpen({ el: e.currentTarget, bl }); }}
                        sx={{ position: "absolute", top: (span!.start / 60) * HOUR + 1, height, left: 1, right: 1, zIndex: 0, border: 0, cursor: canDrag ? "move" : "pointer",
                          borderRadius: "4px", textAlign: "left", font: "inherit", color: "text.secondary", overflow: "hidden", px: 0.75, py: 0.1,
                          backgroundColor: tokens.surface2,
                          backgroundImage: `repeating-linear-gradient(45deg, ${tokens.divider} 0, ${tokens.divider} 1px, transparent 1px, transparent 7px)`,
                          "&:hover": { backgroundColor: tokens.hover }, touchAction: "none" }}>
                        <Box sx={{ fontSize: phone ? 12 : 11, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          Blocked{bl.note ? ` · ${bl.note}` : ""}
                        </Box>
                        {canDrag && whole && height > 22 && (["top", "bottom"] as const).map((edge) => (
                          <Box key={edge} onPointerDown={(e: React.PointerEvent) => { e.stopPropagation(); startDrag(e, { mode: "resize-block", id: bl.id, dayIdx: dayIndex, fixed: edge === "top" ? span!.end : span!.start, edge, note: bl.note }); }}
                            sx={{ position: "absolute", left: 0, right: 0, [edge]: -2, height: 8, cursor: "ns-resize", touchAction: "none" }} />
                        ))}
                      </Box>
                    );
                  })}
                  {placed.map((p) => {
                    // Never smaller than a comfortable tap, even for a 15-minute call.
                    const height = Math.max(phone ? 40 : 22, ((p.end - p.start) / 60) * HOUR - 2);
                    const roomy = height > 34;
                    const box = {
                      position: "absolute", top: (p.start / 60) * HOUR + 1, height,
                      left: `calc(${(p.lane / p.lanes) * 100}% + 2px)`, width: `calc(${100 / p.lanes}% - 6px)`,
                      borderRadius: "6px", px: 0.75, py: roomy ? 0.5 : 0.15,
                      textAlign: "left", font: "inherit", fontSize: phone ? 13.5 : 12, lineHeight: 1.25, overflow: "hidden", cursor: "pointer",
                    } as const;
                    if (p.g) {
                      const g = p.g;
                      return (
                        <Box key={p.key} component="button" type="button" onClick={(e: React.MouseEvent<HTMLElement>) => setOpen({ el: e.currentTarget, g })}
                          sx={{ ...box, zIndex: 1, color: "text.primary", bgcolor: tokens.surface2, border: `1px solid ${tokens.divider}`, borderLeft: `4px solid ${tokens.outline}`,
                            "&:hover": { bgcolor: tokens.hover } }}>
                          <Box sx={{ fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.title}</Box>
                          {roomy && <Box sx={{ color: "text.secondary", whiteSpace: "nowrap" }}>{clock(p.start)} – {clock(p.end)}</Box>}
                        </Box>
                      );
                    }
                    if (p.fb) {
                      const b = p.fb;
                      const startsThisDay = p.start === minutes(new Date(b.starts_at));
                      const dur = Math.round((new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()) / 60000);
                      return (
                        <Box key={p.key} component="button" type="button"
                          onPointerDown={canDrag && startsThisDay ? (e: React.PointerEvent) => { e.stopPropagation(); startDrag(e, { mode: "move-booking", id: b.id, dayIdx: dayIndex, dur, startMin: p.start }); } : undefined}
                          onClick={(e: React.MouseEvent<HTMLElement>) => { if (justDragged.current) { justDragged.current = false; return; } setOpen({ el: e.currentTarget, fb: b }); }}
                          sx={{ ...box, zIndex: 2, bgcolor: FUNNEL_COLOR, color: "#fff", border: 0, cursor: canDrag && startsThisDay ? "grab" : "pointer", touchAction: "none", boxShadow: "0 0 0 1px rgba(255,255,255,.35)", "&:hover": { filter: "brightness(1.08)" } }}>
                          <Box sx={{ fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            Pitch call: {b.name || "new agent"}
                          </Box>
                          {roomy && <Box sx={{ opacity: 0.9, whiteSpace: "nowrap" }}>{clock(p.start)} – {clock(p.end)}</Box>}
                        </Box>
                      );
                    }
                    const it = p.it!;
                    const k = KIND[it.kind];
                    return (
                      <Box
                        key={p.key}
                        component="button"
                        type="button"
                        data-cal-lead={it.lead.id}
                        onClick={(e: React.MouseEvent<HTMLElement>) => setOpen({ el: e.currentTarget, it })}
                        sx={{
                          ...box, zIndex: 2,
                          bgcolor: k.color, color: "#fff", border: 0,
                          boxShadow: flash === it.lead.id || panelLead === it.lead.id ? `0 0 0 2px #fff, 0 0 0 5px ${k.color}` : "0 0 0 1px rgba(255,255,255,.35)",
                          transition: "box-shadow .6s ease", "&:hover": { filter: "brightness(1.08)" },
                        }}
                      >
                        <Box sx={{ fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {k.word}: {it.lead.name}
                        </Box>
                        {roomy && <Box sx={{ opacity: 0.9, whiteSpace: "nowrap" }}>{clock(minutes(it.at))}{p.end - p.start >= 30 ? ` – ${clock(p.end)}` : ""}</Box>}
                      </Box>
                    );
                  })}
                  {/* The live drag preview: a dashed band where it'll land. */}
                  {drag && drag.dayIdx === dayIndex && (() => {
                    const topMin = drag.kind === "range" ? drag.a : drag.top;
                    const botMin = drag.kind === "range" ? drag.b : drag.top + drag.dur;
                    const booking = drag.kind === "move" && drag.booking;
                    return (
                      <Box sx={{ position: "absolute", top: (topMin / 60) * HOUR + 1, height: Math.max(16, ((botMin - topMin) / 60) * HOUR - 2), left: 1, right: 1, zIndex: 5, pointerEvents: "none",
                        borderRadius: "6px", border: `2px dashed ${booking ? FUNNEL_COLOR : tokens.primary}`,
                        bgcolor: booking ? "rgba(57,73,171,.18)" : "rgba(0,0,0,.06)", color: booking ? FUNNEL_COLOR : "text.primary",
                        fontSize: 11, fontWeight: 600, px: 0.75, py: 0.25, overflow: "hidden", whiteSpace: "nowrap" }}>
                        {clock(topMin)} – {clock(botMin)}
                      </Box>
                    );
                  })()}
                  {/* Now: Google's red line with a dot. */}
                  {isToday && (
                    <Box sx={{ position: "absolute", left: 0, right: 0, top: (minutes(now) / 60) * HOUR, height: 2, bgcolor: "#ea4335", zIndex: 3, pointerEvents: "none",
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
          <Box key={`${it.lead.id}-${it.kind}`} sx={{ display: "flex", alignItems: "center", gap: 1, py: 1, px: 1, mx: -1, borderRadius: "8px", transition: "background-color .6s ease", bgcolor: flash === it.lead.id || panelLead === it.lead.id ? tokens.divider2 : "transparent", "& + &": { borderTop: `1px solid ${tokens.divider2}` } }}>
            <Box component="button" type="button" data-cal-lead={it.lead.id} onClick={() => openLead(it.lead.id, "late")}
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

      {showFunnel && (
        <BlockOffSheet open={blockOff} phone={phone} anchor={anchor} submitting={blockMut.isPending}
          onClose={() => setBlockOff(false)} onSubmit={submitBlock} />
      )}

      {showFunnel && (
        <RescheduleSheet booking={rebook} phone={phone} submitting={rescheduleMut.isPending}
          onClose={() => setRebook(null)} onSubmit={(iso) => rebook && submitRebook(rebook, iso)} />
      )}

      <Drawer
        anchor="right"
        open={!!panelLead}
        onClose={closeLead}
        slotProps={{ paper: { sx: { width: { xs: "100%", sm: 480 }, bgcolor: "background.default" } } }}
      >
        {panelLead && (
          <LeadDetailPage
            key={panelLead}
            leadId={panelLead}
            onClose={closeLead}
            nav={panelPos ? { label: `${panelPos.i + 1} of ${panelPos.n}`, prev: panelPos.i > 0 ? () => stepLead(-1) : undefined, next: panelPos.i < panelPos.n - 1 ? () => stepLead(1) : undefined } : undefined}
          />
        )}
      </Drawer>
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
function WeekStrip({ anchor, today, busy, onPick, onTouchStart, onTouchEnd }: {
  anchor: Date; today: Date; busy: (d: Date) => boolean; onPick: (d: Date) => void;
  onTouchStart: (e: React.TouchEvent) => void; onTouchEnd: (e: React.TouchEvent) => void;
}) {
  const start = weekStart(anchor);
  return (
    <Box onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} sx={{ display: "flex", px: 0.5, py: 0.5, bgcolor: "background.paper", borderBottom: `1px solid ${tokens.divider}` }}>
      {Array.from({ length: 7 }, (_, i) => {
        const d = addDays(start, i);
        const picked = sameDay(d, anchor);
        const isToday = sameDay(d, today);
        const on = busy(d);
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
            <Box component="span" sx={{ width: 5, height: 5, borderRadius: "50%", bgcolor: on ? "text.secondary" : "transparent" }} />
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
      href={telHref(it.lead.phone)}
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

/** "In your Google Calendar", opening that entry in Google. */
function InGoogleLink({ href }: { href: string }) {
  return (
    <Box component="a" href={href} target="_blank" rel="noopener noreferrer"
      sx={{ display: "flex", gap: 1, alignItems: "center", color: tokens.primary, textDecoration: "none", minHeight: 32, "&:hover": { textDecoration: "underline" } }}>
      <GoogleCalendarIcon size={18} />
      In your Google Calendar
    </Box>
  );
}

function EventCard({ it, phone, canSeeFullPhone, googleLink, onOpen, onClose }: { it: CalItem; phone: boolean; canSeeFullPhone: boolean; googleLink?: string | null; onOpen: () => void; onClose: () => void }) {
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
        <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}><PhoneIcon sx={{ fontSize: 18, color: "text.secondary" }} />{canSeeFullPhone ? prettyPhone(it.lead.phone) : maskPhone(it.lead.phone)}</Box>
        <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}><ScheduleIcon sx={{ fontSize: 18, color: "text.secondary" }} />{it.label}</Box>
        {googleLink && <InGoogleLink href={googleLink} />}
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

/** One of their own Google events: what and when, and a way into Google. */
function GoogleEventCard({ ev, phone, onClose }: { ev: GoogleEvent; phone: boolean; onClose: () => void }) {
  const longDate = (d: Date) => d.toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long" });
  let when: string;
  if (ev.allDay) {
    const s = parseYmd(ev.start)!;
    const lastDay = parseYmd(ev.end) ? addDays(parseYmd(ev.end)!, -1) : s;
    when = sameDay(s, lastDay) || lastDay < s ? `${longDate(s)} · All day` : `${longDate(s)} – ${longDate(lastDay)}`;
  } else {
    const s = new Date(ev.start);
    const e = new Date(ev.end);
    when = sameDay(s, e) ? `${longDate(s)} · ${clock(minutes(s))} – ${clock(minutes(e))}` : `${longDate(s)}, ${clock(minutes(s))} – ${longDate(e)}, ${clock(minutes(e))}`;
  }
  return (
    <Box>
      <Box sx={{ display: "flex", gap: 1.5, alignItems: "flex-start" }}>
        <Box sx={{ width: 14, height: 14, borderRadius: "4px", bgcolor: tokens.outline, mt: "8px", flex: "none" }} />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography sx={{ fontSize: 20, lineHeight: 1.3, wordBreak: "break-word" }}>{ev.title}</Typography>
          <Typography sx={{ fontSize: 14.5, color: "text.secondary", mt: 0.25 }}>{when}</Typography>
        </Box>
        <IconButton aria-label="Close" onClick={onClose} sx={{ width: 44, height: 44, mt: -1, mr: -1 }}><CloseIcon /></IconButton>
      </Box>
      <Box sx={{ display: "flex", gap: 1, alignItems: "center", mt: 1.5, ml: 3.25, fontSize: 15, color: "text.secondary" }}>
        <GoogleCalendarIcon size={18} /> Your Google Calendar
      </Box>
      {ev.link && (
        <Box sx={{ display: "flex", mt: phone ? 2.5 : 2, justifyContent: "flex-end" }}>
          <Button component="a" href={ev.link} target="_blank" rel="noopener noreferrer" variant={phone ? "outlined" : "text"} fullWidth={phone}
            startIcon={<OpenInNewIcon />} sx={phone ? { minHeight: 52, fontSize: 16 } : undefined}>
            Open in Google Calendar
          </Button>
        </Box>
      )}
    </Box>
  );
}

/** A funnel discovery call (estatekit.co/pitch): when, who, and the Google Meet
 *  link staff join the call on. Operators only. */
function FunnelBookingCard({ b, phone, canSeeFullPhone, onOpen, onReschedule, onCancel, canceling, onSetHosts, settingHosts, onClose }: { b: FunnelBooking; phone: boolean; canSeeFullPhone: boolean; onOpen?: () => void; onReschedule?: () => void; onCancel?: () => void; canceling?: boolean; onSetHosts?: (hosts: string[]) => void; settingHosts?: boolean; onClose: () => void }) {
  const s = new Date(b.starts_at);
  const e = new Date(b.ends_at);
  const moved = (b.reschedule_count ?? 0) > 0;
  const chosen = (b.hosts ?? []).map((h) => h.toLowerCase());
  const toggleHost = (email: string) => {
    const on = chosen.includes(email.toLowerCase());
    onSetHosts?.(on ? chosen.filter((h) => h !== email.toLowerCase()) : [...chosen, email.toLowerCase()]);
  };
  return (
    <Box>
      <Box sx={{ display: "flex", gap: 1.5, alignItems: "flex-start" }}>
        <Box sx={{ width: 14, height: 14, borderRadius: "4px", bgcolor: FUNNEL_COLOR, mt: "8px", flex: "none" }} />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography sx={{ fontSize: 20, lineHeight: 1.3 }}>Pitch call: {b.name || "new agent"}</Typography>
          <Typography sx={{ fontSize: 14.5, color: "text.secondary", mt: 0.25 }}>
            {s.toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long" })} · {clock(minutes(s))} – {clock(minutes(e))}
          </Typography>
        </Box>
        <IconButton aria-label="Close" onClick={onClose} sx={{ width: 44, height: 44, mt: -1, mr: -1 }}><CloseIcon /></IconButton>
      </Box>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1, mt: 1.5, ml: 3.25, fontSize: 15 }}>
        {b.phone && (
          <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
            <PhoneIcon sx={{ fontSize: 18, color: "text.secondary" }} />{canSeeFullPhone ? prettyPhone(b.phone) : maskPhone(b.phone)}
          </Box>
        )}
        <Box sx={{ display: "flex", gap: 1, alignItems: "center", color: "text.secondary" }}>
          <ScheduleIcon sx={{ fontSize: 18 }} />Booked from estatekit.co/pitch{moved ? " · moved once" : ""}
        </Box>
      </Box>
      {onSetHosts && (
        <Box sx={{ mt: 2, ml: 3.25 }}>
          <Typography sx={{ fontSize: 13.5, color: "text.secondary", mb: 0.75 }}>Who's taking this call?</Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
            {PITCH_HOSTS.map((h) => {
              const on = chosen.includes(h.email.toLowerCase());
              return (
                <Chip key={h.email} label={h.name} onClick={() => toggleHost(h.email)} disabled={settingHosts}
                  color={on ? "primary" : "default"} variant={on ? "filled" : "outlined"}
                  sx={{ minHeight: 36, fontSize: 14, px: 0.5 }} />
              );
            })}
          </Box>
          <Typography sx={{ fontSize: 12.5, color: "text.secondary", mt: 0.75 }}>
            They're invited to this call only — the lead and its automations aren't touched.
          </Typography>
        </Box>
      )}
      {phone ? (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1, mt: 2.5 }}>
          {b.meet_url && (
            <Button component="a" href={b.meet_url} target="_blank" rel="noopener noreferrer" variant="contained" fullWidth startIcon={<VideocamIcon />} sx={{ minHeight: 52, fontSize: 16 }}>Join Meet</Button>
          )}
          {onOpen && <Button variant="outlined" fullWidth startIcon={<PersonIcon />} onClick={onOpen} sx={{ minHeight: 52, fontSize: 16 }}>Open lead</Button>}
          {onReschedule && <Button variant="outlined" fullWidth startIcon={<ScheduleSendIcon />} onClick={onReschedule} sx={{ minHeight: 52, fontSize: 16 }}>Change time</Button>}
          {onCancel && <Button color="error" variant="outlined" fullWidth disabled={canceling} startIcon={<EventBusyIcon />} onClick={onCancel} sx={{ minHeight: 52, fontSize: 16 }}>{canceling ? "Cancelling…" : "Cancel call"}</Button>}
        </Box>
      ) : (
        <>
          <Box sx={{ display: "flex", gap: 1, mt: 2, justifyContent: "flex-end" }}>
            {onOpen && <Button startIcon={<PersonIcon />} onClick={onOpen}>Open lead</Button>}
            {b.meet_url && (
              <Button component="a" href={b.meet_url} target="_blank" rel="noopener noreferrer" variant="contained" startIcon={<VideocamIcon />}>Join Meet</Button>
            )}
          </Box>
          {onCancel && (
            <Box sx={{ display: "flex", mt: 1, justifyContent: "flex-end" }}>
              <Button size="small" color="error" disabled={canceling} startIcon={<EventBusyIcon />} onClick={onCancel}>{canceling ? "Cancelling…" : "Cancel call"}</Button>
            </Box>
          )}
        </>
      )}
      {!phone && (
        <Typography sx={{ fontSize: 12.5, color: "text.secondary", mt: 1, textAlign: "right" }}>Drag the block to a new time to reschedule.</Typography>
      )}
    </Box>
  );
}

/** A time staff blocked off — the funnel won't offer it. Shows when, any note,
 *  and a button to lift it. Operators only. */
function BlockedCard({ bl, phone, onRemove, removing, onClose }: { bl: FunnelBlock; phone: boolean; onRemove: () => void; removing: boolean; onClose: () => void }) {
  const s = new Date(bl.start);
  const e = new Date(bl.end);
  const sameD = sameDay(s, e);
  return (
    <Box>
      <Box sx={{ display: "flex", gap: 1.5, alignItems: "flex-start" }}>
        <BlockIcon sx={{ fontSize: 20, color: "text.secondary", mt: "4px", flex: "none" }} />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography sx={{ fontSize: 20, lineHeight: 1.3 }}>Blocked off</Typography>
          <Typography sx={{ fontSize: 14.5, color: "text.secondary", mt: 0.25 }}>
            {s.toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long" })} · {clock(minutes(s))} – {sameD ? clock(minutes(e)) : `${e.toLocaleDateString("en-ZA", { day: "numeric", month: "short" })} ${clock(minutes(e))}`}
          </Typography>
          {bl.note && <Typography sx={{ fontSize: 14.5, mt: 0.5 }}>{bl.note}</Typography>}
        </Box>
        <IconButton aria-label="Close" onClick={onClose} sx={{ width: 44, height: 44, mt: -1, mr: -1 }}><CloseIcon /></IconButton>
      </Box>
      <Typography sx={{ fontSize: 14, color: "text.secondary", mt: 1.5, ml: 3.25 }}>
        estatekit.co/pitch won't offer this time for a discovery call.
      </Typography>
      <Box sx={{ display: "flex", mt: phone ? 2.5 : 2, justifyContent: phone ? "stretch" : "flex-end" }}>
        <Button onClick={onRemove} disabled={removing} color="error" variant={phone ? "outlined" : "text"} fullWidth={phone} startIcon={<DeleteOutlineIcon />} sx={phone ? { minHeight: 52, fontSize: 16 } : undefined}>
          {removing ? "Removing…" : "Remove block"}
        </Button>
      </Box>
    </Box>
  );
}

/** Block off a time so the funnel stops offering it: a day, a start and end,
 *  an optional note. Operators only. */
function BlockOffSheet({ open, onClose, phone, anchor, onSubmit, submitting }: { open: boolean; onClose: () => void; phone: boolean; anchor: Date; onSubmit: (startsAt: string, endsAt: string, note: string) => void; submitting: boolean }) {
  const [date, setDate] = useState(ymd(anchor));
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("10:00");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  // Start fresh each time it opens, on the day they're looking at. Reset during
  // render (not in an effect) off the open → closed edge, as React advises.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) { setDate(ymd(anchor)); setStart("09:00"); setEnd("10:00"); setNote(""); setErr(null); }
  }
  const submit = () => {
    if (!date || !start || !end) { setErr("Pick a day, a start and an end time."); return; }
    const s = new Date(`${date}T${start}:00`);
    const e = new Date(`${date}T${end}:00`);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) { setErr("That day or time doesn't look right."); return; }
    if (e.getTime() <= s.getTime()) { setErr("The end time must be after the start time."); return; }
    setErr(null);
    onSubmit(s.toISOString(), e.toISOString(), note.trim());
  };
  return (
    <Sheet open={open} onClose={onClose} phone={phone}>
      <Box sx={{ display: "flex", alignItems: "center", mb: 1.5 }}>
        <Typography sx={{ fontSize: 18, fontWeight: 600, flex: 1 }}>Block off time</Typography>
        <IconButton aria-label="Close" onClick={onClose} sx={{ width: 44, height: 44, mr: -1 }}><CloseIcon /></IconButton>
      </Box>
      <Typography sx={{ fontSize: 14, color: "text.secondary", mb: 2 }}>
        While a time is blocked, estatekit.co/pitch won't offer it for a discovery call.
      </Typography>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <TextField label="Day" type="date" value={date} onChange={(e) => setDate(e.target.value)} fullWidth slotProps={{ inputLabel: { shrink: true } }} />
        <Box sx={{ display: "flex", gap: 2 }}>
          <TextField label="From" type="time" value={start} onChange={(e) => setStart(e.target.value)} fullWidth slotProps={{ inputLabel: { shrink: true } }} />
          <TextField label="To" type="time" value={end} onChange={(e) => setEnd(e.target.value)} fullWidth slotProps={{ inputLabel: { shrink: true } }} />
        </Box>
        <TextField label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value.slice(0, 140))} fullWidth placeholder="e.g. Leave, out of office" />
        {err && <Typography sx={{ fontSize: 14, color: "error.main" }}>{err}</Typography>}
      </Box>
      <Box sx={{ display: "flex", gap: 1, mt: 3, justifyContent: phone ? "stretch" : "flex-end" }}>
        {!phone && <Button onClick={onClose} disabled={submitting}>Cancel</Button>}
        <Button onClick={submit} disabled={submitting} variant="contained" fullWidth={phone} startIcon={<BlockIcon />} sx={phone ? { minHeight: 52, fontSize: 16 } : undefined}>
          {submitting ? "Blocking…" : "Block off"}
        </Button>
      </Box>
    </Sheet>
  );
}

/** Move a discovery call to a new time: pick a day and start time. Keeps the
 *  call's length. Used on phones (desktop drags the block instead). */
function RescheduleSheet({ booking, phone, onClose, onSubmit, submitting }: { booking: FunnelBooking | null; phone: boolean; onClose: () => void; onSubmit: (startsAt: string) => void; submitting: boolean }) {
  const open = !!booking;
  const [date, setDate] = useState("");
  const [start, setStart] = useState("");
  const [err, setErr] = useState<string | null>(null);
  // Prefill with the call's current time each time it opens, off the edge.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open && booking) {
      const s = new Date(booking.starts_at);
      setDate(ymd(s));
      setStart(`${String(s.getHours()).padStart(2, "0")}:${String(s.getMinutes()).padStart(2, "0")}`);
      setErr(null);
    }
  }
  const mins = booking ? Math.round((new Date(booking.ends_at).getTime() - new Date(booking.starts_at).getTime()) / 60000) : 30;
  const submit = () => {
    if (!date || !start) { setErr("Pick a day and a time."); return; }
    const s = new Date(`${date}T${start}:00`);
    if (isNaN(s.getTime())) { setErr("That day or time doesn't look right."); return; }
    setErr(null);
    onSubmit(s.toISOString());
  };
  return (
    <Sheet open={open} onClose={onClose} phone={phone}>
      <Box sx={{ display: "flex", alignItems: "center", mb: 1.5 }}>
        <Typography sx={{ fontSize: 18, fontWeight: 600, flex: 1 }}>Change the call time</Typography>
        <IconButton aria-label="Close" onClick={onClose} sx={{ width: 44, height: 44, mr: -1 }}><CloseIcon /></IconButton>
      </Box>
      <Typography sx={{ fontSize: 14, color: "text.secondary", mb: 2 }}>
        {booking?.name ? `${booking.name}'s ` : "This "}call moves to the new time. Their diary invite updates and the reminder follows.
      </Typography>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <TextField label="Day" type="date" value={date} onChange={(e) => setDate(e.target.value)} fullWidth slotProps={{ inputLabel: { shrink: true } }} />
        <TextField label="Start time" type="time" value={start} onChange={(e) => setStart(e.target.value)} fullWidth slotProps={{ inputLabel: { shrink: true } }} helperText={`Keeps the ${mins}-minute length`} />
        {err && <Typography sx={{ fontSize: 14, color: "error.main" }}>{err}</Typography>}
      </Box>
      <Box sx={{ display: "flex", gap: 1, mt: 3, justifyContent: phone ? "stretch" : "flex-end" }}>
        {!phone && <Button onClick={onClose} disabled={submitting}>Cancel</Button>}
        <Button onClick={submit} disabled={submitting} variant="contained" fullWidth={phone} startIcon={<ScheduleSendIcon />} sx={phone ? { minHeight: 52, fontSize: 16 } : undefined}>
          {submitting ? "Moving…" : "Move call"}
        </Button>
      </Box>
    </Sheet>
  );
}

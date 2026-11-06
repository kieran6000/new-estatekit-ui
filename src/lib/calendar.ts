import type { LeadRow } from "../types";

// The Calendar tab: a lead's dated moments, by day. The same moments go into
// the agent's Google Calendar when it's connected (entryTime in
// supabase/functions/_shared/calendarEvents.ts): keep the two in step.
//   appointment  Booked / Viewing Booked with a time
//   call         the call time they picked (not once they're Lost)
//   followup     the reminder "How did it go?" set (Spoke, following up →
//                tomorrow / in 2 days / next week…), or a workflow's. Not for
//                Lost or won leads, and one entry when it's the same moment
//                as the appointment or call time.

export type CalKind = "appointment" | "viewing" | "call" | "followup";
export interface CalItem { lead: LeadRow; kind: CalKind; at: Date; label: string }

/** Google Calendar's own event colours (Peacock, Grape, Basil, Tomato): the
 *  blocks here and the entries in their Google Calendar look the same. */
export const KIND_STYLE: Record<CalKind, { color: string; word: string }> = {
  appointment: { color: "#039be5", word: "Appointment" },
  viewing: { color: "#8e24aa", word: "Viewing" },
  call: { color: "#0b8043", word: "Call" },
  followup: { color: "#d50000", word: "Follow up" },
};

/** The kind Google sync uses for a Calendar tab item (a viewing is an appointment there). */
export const syncKind = (k: CalKind): "appointment" | "call" | "followup" => (k === "viewing" ? "appointment" : k);

const BOOKED = ["Booked", "Viewing Booked"];
const GONE = ["Lost", "Invalid Number"];
const WON = ["Mandate Signed", "Bought"];

export function calendarItems(leads: LeadRow[]): CalItem[] {
  const out: CalItem[] = [];
  const valid = (d: Date | null): d is Date => !!d && !Number.isNaN(d.getTime());
  for (const l of leads) {
    if (l.archived) continue;
    const appt = l.appointment_at && BOOKED.includes(l.stage) ? new Date(l.appointment_at) : null;
    if (valid(appt)) {
      out.push({ lead: l, kind: l.stage === "Viewing Booked" ? "viewing" : "appointment", at: appt, label: l.stage === "Viewing Booked" ? "Viewing" : "Appointment" });
    }
    const call = l.call_at && !GONE.includes(l.stage) ? new Date(l.call_at) : null;
    if (valid(call)) out.push({ lead: l, kind: "call", at: call, label: "Call: they picked this time" });
    const rem = l.reminder_at && !GONE.includes(l.stage) && !WON.includes(l.stage) ? new Date(l.reminder_at) : null;
    const same = (d: Date | null) => valid(d) && Math.abs(rem!.getTime() - d.getTime()) < 60_000;
    if (valid(rem) && !same(appt) && !same(call)) {
      out.push({ lead: l, kind: "followup", at: rem, label: (l.next_label || "Follow up").trim() });
    }
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** Midnight (local time) at the start of the Monday of the week `d` is in. */
export function weekStart(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const back = (x.getDay() + 6) % 7; // Monday = 0
  x.setDate(x.getDate() - back);
  return x;
}

/** The seven days from `start`, each with its items in time order. */
export function weekDays(items: CalItem[], start: Date): { day: Date; items: CalItem[] }[] {
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const next = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i + 1);
    return { day, items: items.filter((it) => it.at >= day && it.at < next) };
  });
}

/** Follow-ups whose day has passed that are still on their call list (due):
 *  still to do. (A follow-up that's no longer due shows on its day, but isn't
 *  nagged about here: the call list decides what's outstanding.) */
export function overdue(items: CalItem[], now = new Date()): CalItem[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return items.filter((it) => it.kind === "followup" && it.lead.due && it.at < today);
}

/** How long each kind shows for, in minutes (as long as the Google entry). */
export const DURATION: Record<CalKind, number> = { appointment: 60, viewing: 60, call: 15, followup: 15 };

export interface Placed { it: CalItem; start: number; end: number; lane: number; lanes: number }

/** Blocks for one day, side by side where they overlap (like Google
 *  Calendar): start/end are minutes from midnight; lane of lanes says which
 *  slice. Works for anything with a start and an end. */
export function layoutBlocks<T extends { start: number; end: number }>(blocks: T[]): (T & { lane: number; lanes: number })[] {
  const placed = blocks
    .map((b) => ({ ...b, lane: 0, lanes: 1 }))
    .sort((a, b) => a.start - b.start || b.end - a.end);
  // Groups of blocks that overlap each other share the width.
  let group: typeof placed = [];
  let groupEnd = -1;
  const close = () => { const n = Math.max(1, ...group.map((g) => g.lane + 1)); group.forEach((g) => { g.lanes = n; }); group = []; };
  for (const b of placed) {
    if (b.start >= groupEnd) { close(); groupEnd = -1; }
    const used = new Set(group.filter((g) => g.end > b.start).map((g) => g.lane));
    let lane = 0;
    while (used.has(lane)) lane++;
    b.lane = lane;
    group.push(b);
    groupEnd = Math.max(groupEnd, b.end);
  }
  close();
  return placed;
}

/** One day's EstateKit items as blocks. */
export function layoutDay(items: CalItem[]): Placed[] {
  return layoutBlocks(items.map((it) => {
    const start = it.at.getHours() * 60 + it.at.getMinutes();
    return { it, start, end: Math.min(24 * 60, start + DURATION[it.kind]) };
  }));
}

// ---- Their own Google events, on the same grid.

export interface GoogleSpan { start: number; end: number }

/** The part of a Google event that falls on `day` (minutes from midnight),
 *  or null if none of it does. Events running past midnight are cut at it. */
export function spanOnDay(startIso: string, endIso: string, day: Date): GoogleSpan | null {
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  const dayEnd = dayStart + 86_400_000;
  const s = Date.parse(startIso);
  const e = Math.max(Date.parse(endIso), s + 15 * 60_000);
  if (!Number.isFinite(s) || e <= dayStart || s >= dayEnd) return null;
  const start = Math.round((Math.max(s, dayStart) - dayStart) / 60_000);
  const end = Math.round((Math.min(e, dayEnd) - dayStart) / 60_000);
  return { start, end: Math.min(24 * 60, Math.max(end, start + 15)) };
}

/** Whether an all-day Google event (YYYY-MM-DD, end exclusive) covers `day`. */
export function allDayCovers(startYmd: string, endYmd: string, day: Date): boolean {
  const p = (v: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v); return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : NaN; };
  const d = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  const s = p(startYmd);
  const e = p(endYmd);
  return Number.isFinite(s) && d >= s && d < (Number.isFinite(e) && e > s ? e : s + 86_400_000);
}

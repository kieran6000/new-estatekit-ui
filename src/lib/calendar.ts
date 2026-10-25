import type { LeadRow } from "../types";

// The Calendar tab: a lead's dated moments, by day. The same dates the
// Google Calendar sync uses (supabase/functions/google-calendar-sync), plus
// follow-up reminders.
//   appointment  Booked / Viewing Booked with a time
//   call         the call time they picked (not once they're Lost)
//   followup     a reminder that's due (not the appointment or call time
//                itself: a reminder set for that same moment is one entry)

export type CalKind = "appointment" | "viewing" | "call" | "followup";
export interface CalItem { lead: LeadRow; kind: CalKind; at: Date; label: string }

const BOOKED = ["Booked", "Viewing Booked"];
const GONE = ["Lost", "Invalid Number"];

export function calendarItems(leads: LeadRow[]): CalItem[] {
  const out: CalItem[] = [];
  for (const l of leads) {
    if (l.archived) continue;
    const appt = l.appointment_at && BOOKED.includes(l.stage) ? new Date(l.appointment_at) : null;
    if (appt && !Number.isNaN(appt.getTime())) {
      out.push({ lead: l, kind: l.stage === "Viewing Booked" ? "viewing" : "appointment", at: appt, label: l.stage === "Viewing Booked" ? "Viewing" : "Appointment" });
    }
    const call = l.call_at && !GONE.includes(l.stage) ? new Date(l.call_at) : null;
    if (call && !Number.isNaN(call.getTime())) out.push({ lead: l, kind: "call", at: call, label: "Call: they picked this time" });
    const rem = l.reminder_at && l.due && !GONE.includes(l.stage) ? new Date(l.reminder_at) : null;
    const same = (d: Date | null) => !!d && !Number.isNaN(d.getTime()) && Math.abs(rem!.getTime() - d.getTime()) < 60_000;
    if (rem && !Number.isNaN(rem.getTime()) && !same(appt) && !same(call)) {
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

/** Follow-ups whose time has passed (before today): still to do. */
export function overdue(items: CalItem[], now = new Date()): CalItem[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return items.filter((it) => it.kind === "followup" && it.at < today);
}

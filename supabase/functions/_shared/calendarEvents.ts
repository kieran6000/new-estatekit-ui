// What a lead's entry in the agent's Google Calendar should be, or null for
// "it shouldn't be there". Pure (no Deno, no network), so it's tested
// (calendarEvents.test.ts). The Calendar tab shows the same moments
// (src/lib/calendar.ts): keep the two in step.
//   appointment  Booked / Viewing Booked with a time: 1 hour, with the address.
//   call         the call time they picked, not once they're Lost: 15 min.
//   followup     the reminder "How did it go?" set (Spoke, following up →
//                tomorrow, in 2 days…), or a workflow's: 15 min, at that time.
//                Not for Lost / won leads, and not when it's the same moment
//                as the appointment or call time (that entry covers it).

export const APP = "https://leads.estatekit.co";
export const DEFAULT_TZ = "Africa/Johannesburg";

export type CalKind = "appointment" | "call" | "followup";
export const CAL_KINDS: CalKind[] = ["appointment", "call", "followup"];

export interface CalLead {
  id: string;
  name: string;
  phone: string | null;
  stage: string;
  archived: boolean;
  appointment_at: string | null;
  call_at: string | null;
  reminder_at?: string | null;
  next_label?: string | null;
  note?: string | null;
  form_answers: unknown;
}

export interface CalEvent {
  summary: string;
  description: string;
  location?: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  colorId: string;
  transparency: "opaque" | "transparent";
  reminders: { useDefault: false; overrides: { method: "popup"; minutes: number }[] };
  source: { title: string; url: string };
  extendedProperties: { private: { estatekit_lead: string; estatekit_kind: CalKind } };
}

export interface CalOptions {
  /** The pipeline's kind: "general" says Meeting, not Appointment. */
  pipelineKind?: string | null;
  /** The agent's own calendar time zone (from Google), else Johannesburg. */
  timeZone?: string | null;
}

const BOOKED = ["Booked", "Viewing Booked"];
const GONE = ["Lost", "Invalid Number"];
const WON = ["Mandate Signed", "Bought"];
const MINUTES: Record<CalKind, number> = { appointment: 60, call: 15, followup: 15 };
// Google Calendar's own colours, matching the Calendar tab's blocks:
// Peacock (appointment), Grape (viewing), Basil (call), Tomato (follow-up).
const COLOR = { appointment: "7", viewing: "3", call: "10", followup: "11" };
// Popups: an hour and 15 minutes before an appointment (time to drive), a
// little before a picked call time, and on the dot for a follow-up.
const POPUPS: Record<CalKind, number[]> = { appointment: [60, 15], call: [10], followup: [0] };

const valid = (iso: string | null | undefined): iso is string => !!iso && !Number.isNaN(Date.parse(iso));
const sameMoment = (a: string, b: string | null) => valid(b) && Math.abs(Date.parse(a) - Date.parse(b)) < 60_000;

/** The time this kind of entry is at, or null when the lead shouldn't have one. */
export function entryTime(l: CalLead, kind: CalKind): string | null {
  if (l.archived) return null;
  const appt = BOOKED.includes(l.stage) && valid(l.appointment_at) ? l.appointment_at : null;
  const call = !GONE.includes(l.stage) && valid(l.call_at) ? l.call_at : null;
  if (kind === "appointment") return appt;
  if (kind === "call") return call;
  const rem = l.reminder_at;
  if (!valid(rem) || GONE.includes(l.stage) || WON.includes(l.stage)) return null;
  if (sameMoment(rem, appt) || sameMoment(rem, call)) return null;
  return rem;
}

function address(l: CalLead): string {
  const answers = Array.isArray(l.form_answers) ? (l.form_answers as { q?: string; a?: string }[]) : [];
  return (answers.find((x) => /address/i.test(x.q || ""))?.a || "").trim();
}

/** The reminder's own words, when they say more than "follow up in 2 days"
 *  (a workflow's "Call Merle: she asked for a call back", say). */
function reminderWords(label: string | null | undefined): string {
  const t = (label || "").trim();
  if (!t || t === "—" || /^(just came in|appt\b|retry today$|follow up\b)/i.test(t)) return "";
  return t;
}

export function desiredEvent(l: CalLead, kind: CalKind, opts: CalOptions = {}): CalEvent | null {
  const at = entryTime(l, kind);
  if (!at) return null;
  const start = new Date(at);
  const end = new Date(start.getTime() + MINUTES[kind] * 60_000);
  const tz = opts.timeZone || DEFAULT_TZ;
  const where = kind === "appointment" ? address(l) : "";
  const viewing = l.stage === "Viewing Booked";
  const retry = kind === "followup" && /^retry/i.test((l.next_label || "").trim());

  const summary = kind === "appointment"
    ? viewing ? `🏠 Viewing: ${l.name}` : `📅 ${opts.pipelineKind === "general" ? "Meeting" : "Appointment"}: ${l.name}`
    : kind === "call"
    ? `📞 Call ${l.name} (they picked this time)`
    : `📞 ${retry ? "Try again" : "Follow up"}: ${l.name}`;

  const note = (l.note || "").trim();
  const link = `${APP}/leads/${l.id}`;
  const description = [
    l.phone ? `Phone: ${l.phone}` : "",
    where ? `Address: ${where}` : "",
    kind === "followup" ? reminderWords(l.next_label) : "",
    note ? `Notes: ${note.length > 500 ? note.slice(0, 499) + "…" : note}` : "",
    `Open in EstateKit: ${link}`,
  ].filter(Boolean).join("\n");

  return {
    summary,
    description,
    ...(where ? { location: where } : {}),
    start: { dateTime: start.toISOString(), timeZone: tz },
    end: { dateTime: end.toISOString(), timeZone: tz },
    colorId: kind === "appointment" && viewing ? COLOR.viewing : COLOR[kind],
    // A follow-up is a reminder, not a meeting: it doesn't make them look busy.
    transparency: kind === "followup" ? "transparent" : "opaque",
    reminders: { useDefault: false, overrides: POPUPS[kind].map((minutes) => ({ method: "popup", minutes })) },
    source: { title: "EstateKit", url: link },
    extendedProperties: { private: { estatekit_lead: l.id, estatekit_kind: kind } },
  };
}

/** Our own id for the Google event, from the lead, the kind and the start:
 *  a create that's retried (or run twice at once) asks for the same id, and
 *  Google refuses the second (409) instead of making a duplicate. Google ids
 *  are 5–1024 characters of a–v and 0–9 (base32hex): a uuid's hex digits
 *  and a base-32 number are exactly that. */
export function eventIdFor(leadId: string, kind: CalKind, startIso: string): string {
  const k = kind === "appointment" ? "a" : kind === "call" ? "c" : "f";
  return `ek${leadId.replace(/-/g, "").toLowerCase()}${k}${Math.floor(Date.parse(startIso) / 1000).toString(32)}`;
}

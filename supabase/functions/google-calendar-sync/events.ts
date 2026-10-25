// What a lead's entry in the agent's Google Calendar should be, or null for
// "it shouldn't be there". Pure, so it's tested (events.test.ts).
//   appointment  Booked / Viewing Booked with a time, not archived: 1 hour.
//   call         the call time they picked, not archived, not Lost: 15 min.

export const APP = "https://leads.estatekit.co";
export const TZ = "Africa/Johannesburg";

export interface CalLead {
  id: string;
  name: string;
  phone: string | null;
  stage: string;
  archived: boolean;
  appointment_at: string | null;
  call_at: string | null;
  form_answers: unknown;
}

export interface CalEvent {
  summary: string;
  description: string;
  location?: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  reminders: { useDefault: boolean };
  extendedProperties: { private: { estatekit_lead: string; estatekit_kind: string } };
}

const BOOKED = ["Booked", "Viewing Booked"];
const GONE = ["Lost", "Invalid Number"];

function address(l: CalLead): string {
  const answers = Array.isArray(l.form_answers) ? (l.form_answers as { q?: string; a?: string }[]) : [];
  return (answers.find((x) => /address/i.test(x.q || ""))?.a || "").trim();
}

export function desiredEvent(l: CalLead, kind: "appointment" | "call"): CalEvent | null {
  if (l.archived) return null;
  const at = kind === "appointment" ? (BOOKED.includes(l.stage) ? l.appointment_at : null) : GONE.includes(l.stage) ? null : l.call_at;
  if (!at || Number.isNaN(Date.parse(at))) return null;
  const minutes = kind === "appointment" ? 60 : 15;
  const start = new Date(at);
  const end = new Date(start.getTime() + minutes * 60_000);
  const where = address(l);
  const summary = kind === "appointment"
    ? `${l.stage === "Viewing Booked" ? "🏠 Viewing" : "📅 Appointment"}: ${l.name}`
    : `📞 Call ${l.name} (they picked this time)`;
  const description = [
    l.phone ? `Phone: ${l.phone}` : "",
    where ? `Address: ${where}` : "",
    "",
    `Open in EstateKit: ${APP}/leads/${l.id}`,
  ].filter((x, i, a) => x !== "" || (i > 0 && a[i - 1] !== "")).join("\n").trim();
  return {
    summary,
    description,
    ...(kind === "appointment" && where ? { location: where } : {}),
    start: { dateTime: start.toISOString(), timeZone: TZ },
    end: { dateTime: end.toISOString(), timeZone: TZ },
    reminders: { useDefault: true },
    extendedProperties: { private: { estatekit_lead: l.id, estatekit_kind: kind } },
  };
}

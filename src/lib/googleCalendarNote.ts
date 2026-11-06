import type { CalSyncResult } from "../api/googleCalendar";

// The line added to the "Follow-up reminder set" snack once Google has the
// entry: what actually happened in their calendar, never a guess.

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Today, 17:45", "Tomorrow, 09:00" or "Thu 6 Nov, 17:45". */
export function whenWords(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(d) - start(now)) / 86_400_000);
  const day = diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return `${day}, ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const RANK = { appointment: 0, call: 1, followup: 2 } as const;

/** One short line for the snack, or null when their calendar didn't change. */
export function calendarNote(results: CalSyncResult[], opts: { theirs?: boolean; now?: Date } = {}): string | null {
  const whose = opts.theirs ? "their" : "your";
  const changed = results
    .filter((r) => (r.action === "created" || r.action === "moved") && r.at)
    .sort((a, b) => RANK[a.kind] - RANK[b.kind]);
  if (changed.length) {
    const r = changed[0];
    return `${r.action === "moved" ? "Moved in" : "In"} ${whose} Google Calendar: ${whenWords(r.at!, opts.now)}`;
  }
  if (results.some((r) => r.action === "removed")) return `Taken out of ${whose} Google Calendar`;
  if (results.some((r) => r.action === "reconnect")) return "Google Calendar needs reconnecting: Account → Google Calendar";
  if (results.some((r) => r.action === "retry" || r.action === "failed")) return "Google Calendar didn't answer. It will catch up by itself.";
  return null;
}

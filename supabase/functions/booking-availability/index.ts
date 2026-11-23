// Open times for the funnel's discovery call (estatekit.co/pitch). The public
// booking widget calls this to show the days and times a prospect can pick.
//
// Rules (which days, hours, slot length, how far ahead) come from the
// booking_config row; the real free/busy comes from partner@'s Google Calendar
// right now, so a time already taken is never offered. Read-only.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { CAL_API, partsInTz, saToken, zonedToUtc } from "../_shared/googleSa.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

interface Config {
  slug: string;
  time_zone: string;
  slot_minutes: number;
  buffer_minutes: number;
  lead_time_minutes: number;
  window_days: number;
  weekly_hours: Record<string, [string, string][]>;
  calendar_email: string;
  active: boolean;
}

const hm = (s: string): number => {
  const [h, m] = s.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

// partner@'s busy blocks across the window, each [startMs, endMs].
async function busyIntervals(email: string, minIso: string, maxIso: string): Promise<[number, number][]> {
  const token = await saToken(email);
  const res = await fetch(`${CAL_API}/freeBusy`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ timeMin: minIso, timeMax: maxIso, items: [{ id: email }] }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`freebusy: ${data?.error?.message ?? res.status}`);
  const busy = data?.calendars?.[email]?.busy ?? [];
  return busy.map((b: { start: string; end: string }) => [Date.parse(b.start), Date.parse(b.end)] as [number, number]);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const body = await req.json().catch(() => ({}));
  const slug = typeof body?.slug === "string" && body.slug ? body.slug : "pitch";

  const { data: cfg } = await admin.from("booking_config").select("*").eq("slug", slug).maybeSingle();
  const c = cfg as Config | null;
  if (!c || !c.active) return json({ ok: true, time_zone: "Africa/Johannesburg", slot_minutes: 30, days: [] });

  const tz = c.time_zone || "Africa/Johannesburg";
  const now = Date.now();
  const earliest = now + c.lead_time_minutes * 60_000;
  const windowEnd = now + c.window_days * 86_400_000;

  // Candidate slots from the weekly rules, in the configured zone.
  const candidates: { startMs: number; endMs: number }[] = [];
  for (let dayOffset = 0; dayOffset <= c.window_days; dayOffset++) {
    const { y, m, d, wd } = partsInTz(now + dayOffset * 86_400_000, tz);
    const windows = c.weekly_hours?.[wd] ?? [];
    for (const [from, to] of windows) {
      const start = hm(from), end = hm(to);
      for (let t = start; t + c.slot_minutes <= end; t += c.slot_minutes) {
        const sUtc = zonedToUtc(y, m, d, Math.floor(t / 60), t % 60, tz).getTime();
        const eUtc = sUtc + c.slot_minutes * 60_000;
        if (sUtc >= earliest && sUtc <= windowEnd) candidates.push({ startMs: sUtc, endMs: eUtc });
      }
    }
  }
  candidates.sort((a, b) => a.startMs - b.startMs);
  if (candidates.length === 0) return json({ ok: true, time_zone: tz, slot_minutes: c.slot_minutes, days: [] });

  // Drop any that clash with partner@'s calendar (expanded by the buffer).
  let busy: [number, number][] = [];
  try {
    busy = await busyIntervals(
      c.calendar_email,
      new Date(candidates[0].startMs).toISOString(),
      new Date(candidates[candidates.length - 1].endMs).toISOString(),
    );
  } catch (err) {
    console.error("booking-availability freebusy", String(err));
    // Can't read the calendar right now: show nothing rather than risk a double
    // booking. The widget shows its "no times" message, never a raw error.
    return json({ ok: true, time_zone: tz, slot_minutes: c.slot_minutes, days: [] });
  }
  const buf = c.buffer_minutes * 60_000;
  let free = candidates.filter((s) =>
    !busy.some(([bs, be]) => s.startMs - buf < be && s.endMs + buf > bs)
  );

  // Overflow: when the WHOLE window is full, re-offer already-booked slots that
  // still have room (cap 2) so a second lead can book — a closer (Khushil) covers
  // these. Only slots taken by a real booking (not a staff block or manual event)
  // are re-offered: we count booked rows per slot and open the ones with exactly
  // one. As soon as any normal slot frees, free is non-empty and overflow is off.
  let overflow = false;
  if (free.length === 0) {
    const { data: booked } = await admin.from("bookings")
      .select("starts_at").eq("slug", slug).eq("status", "booked")
      .gte("starts_at", new Date(candidates[0].startMs).toISOString())
      .lte("starts_at", new Date(candidates[candidates.length - 1].endMs).toISOString());
    const countBy = new Map<number, number>();
    for (const b of (booked ?? []) as { starts_at: string }[]) {
      const ms = Date.parse(b.starts_at);
      countBy.set(ms, (countBy.get(ms) ?? 0) + 1);
    }
    const overflowSlots = candidates.filter((s) => {
      const n = countBy.get(s.startMs) ?? 0;
      return n >= 1 && n < 2;
    });
    if (overflowSlots.length > 0) {
      free = overflowSlots;
      overflow = true;
    }
  }

  // Group by local day for the widget, with a display label and the exact UTC
  // instant (what booking-create books against).
  const fmtDay = new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", day: "2-digit", month: "short" });
  const fmtTime = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const byDay = new Map<string, { date: string; label: string; slots: { start: string; label: string }[] }>();
  for (const s of free) {
    const { y, m, d } = partsInTz(s.startMs, tz);
    const date = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (!byDay.has(date)) byDay.set(date, { date, label: fmtDay.format(new Date(s.startMs)), slots: [] });
    byDay.get(date)!.slots.push({ start: new Date(s.startMs).toISOString(), label: fmtTime.format(new Date(s.startMs)) });
  }

  // `overflow` tells the widget these are full-window overflow slots; it passes
  // overflow:true back to booking-create, which then takes the 2nd seat (rank 2).
  return json({ ok: true, time_zone: tz, slot_minutes: c.slot_minutes, overflow, days: [...byDay.values()] });
});

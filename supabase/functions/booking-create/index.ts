// Books the discovery call for the estatekit.co/pitch funnel. Called by the
// booking widget AFTER estatekit-funnel-lead has created the lead (which
// already sets stage Booked + the call time). This function adds the one thing
// the funnel can't do on its own: a real Google Calendar event with a Google
// Meet link, created as partner@ via the service account, plus a bookings row
// the dashboard reads.
//
// Separation on purpose: funnel-lead owns the lead + pixel; this owns the
// calendar. The prospect gets Google's own invite email (Meet link included).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { CAL_API, saToken } from "../_shared/googleSa.ts";

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
  calendar_email: string;
  active: boolean;
}

// partner@'s busy blocks touching [minIso, maxIso].
async function busyIntervals(token: string, email: string, minIso: string, maxIso: string): Promise<[number, number][]> {
  const res = await fetch(`${CAL_API}/freeBusy`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ timeMin: minIso, timeMax: maxIso, items: [{ id: email }] }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`freebusy: ${data?.error?.message ?? res.status}`);
  return (data?.calendars?.[email]?.busy ?? []).map(
    (b: { start: string; end: string }) => [Date.parse(b.start), Date.parse(b.end)] as [number, number],
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const body = await req.json().catch(() => ({}));
  const slug = typeof body?.slug === "string" && body.slug ? body.slug : "pitch";
  const startsAt = typeof body?.startsAt === "string" ? body.startsAt : "";
  const leadId = typeof body?.lead_id === "string" && body.lead_id ? body.lead_id : null;
  const name = String(body?.name ?? "").trim();
  const email = String(body?.email ?? "").trim() || null;
  const phone = String(body?.phone ?? "").trim() || null;
  const answers = body?.answers ?? null;

  const start = new Date(startsAt);
  if (!startsAt || isNaN(start.getTime())) return json({ ok: false, error: "Pick a time to book." }, 400);

  const { data: cfg } = await admin.from("booking_config").select("*").eq("slug", slug).maybeSingle();
  const c = cfg as Config | null;
  if (!c || !c.active) return json({ ok: false, error: "Booking is closed right now." }, 409);

  const startMs = start.getTime();
  const endMs = startMs + c.slot_minutes * 60_000;
  if (startMs < Date.now() + c.lead_time_minutes * 60_000 - 60_000) {
    return json({ ok: false, error: "That time has passed. Please pick another.", retry: true }, 409);
  }

  // Don't make two cards for a double-tap: if this lead already has a live
  // booking at this time, hand the same one back.
  if (leadId) {
    const { data: dupe } = await admin.from("bookings")
      .select("id, meet_url, event_link, starts_at")
      .eq("lead_id", leadId).eq("starts_at", start.toISOString())
      .neq("status", "cancelled").maybeSingle();
    if (dupe) {
      return json({ ok: true, booking_id: dupe.id, meet_url: dupe.meet_url, event_link: dupe.event_link, starts_at: dupe.starts_at, already: true });
    }
  }

  // partner@ token + a last-moment free/busy check, so the time can't be
  // double-booked between loading the page and pressing Book.
  let token: string;
  try {
    token = await saToken(c.calendar_email);
  } catch (err) {
    const msg = String((err as Error)?.message ?? err);
    console.error("booking-create token", msg);
    // not-configured / bad-sa-key / scope not granted yet — never shown raw.
    return json({ ok: false, error: "Booking isn't switched on yet. Please try again shortly." }, 503);
  }

  try {
    const clash = await busyIntervals(token, c.calendar_email, start.toISOString(), new Date(endMs).toISOString());
    const buf = c.buffer_minutes * 60_000;
    if (clash.some(([bs, be]) => startMs - buf < be && endMs + buf > bs)) {
      return json({ ok: false, error: "Someone just took that time. Please pick another.", retry: true }, 409);
    }
  } catch (err) {
    console.error("booking-create freebusy", String(err));
    return json({ ok: false, error: "Couldn't check the diary just now. Please try again.", retry: true }, 502);
  }

  const bookingId = crypto.randomUUID();
  const tz = c.time_zone || "Africa/Johannesburg";
  const lines = [
    `Booked from estatekit.co/pitch.`,
    ``,
    `Name: ${name || "—"}`,
    phone ? `Phone: ${phone}` : "",
    email ? `Email: ${email}` : "",
  ];
  if (Array.isArray(answers)) {
    for (const a of answers) {
      if (a && typeof a.q === "string" && typeof a.a === "string") lines.push(`${a.q} ${a.a}`);
    }
  }

  const event = {
    summary: `EstateKit discovery call — ${name || "new agent"}`,
    description: lines.filter(Boolean).join("\n"),
    start: { dateTime: start.toISOString(), timeZone: tz },
    end: { dateTime: new Date(endMs).toISOString(), timeZone: tz },
    attendees: email ? [{ email, displayName: name || undefined }] : [],
    conferenceData: {
      createRequest: { requestId: bookingId, conferenceSolutionKey: { type: "hangoutsMeet" } },
    },
    reminders: { useDefault: true },
    extendedProperties: { private: { estatekit_booking: bookingId, estatekit_slug: slug } },
  };

  const evRes = await fetch(
    `${CAL_API}/calendars/${encodeURIComponent(c.calendar_email)}/events?conferenceDataVersion=1&sendUpdates=all`,
    { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(event) },
  );
  const ev = await evRes.json().catch(() => ({}));
  if (!evRes.ok) {
    console.error("booking-create event insert", evRes.status, JSON.stringify(ev?.error ?? ev).slice(0, 500));
    return json({ ok: false, error: "Couldn't put the call in the diary. Please try again.", retry: true }, 502);
  }

  const meetUrl: string | null =
    ev.hangoutLink ??
    ev.conferenceData?.entryPoints?.find((e: { entryPointType?: string; uri?: string }) => e.entryPointType === "video")?.uri ??
    null;

  const { error: insErr } = await admin.from("bookings").insert({
    id: bookingId,
    slug,
    lead_id: leadId,
    starts_at: start.toISOString(),
    ends_at: new Date(endMs).toISOString(),
    time_zone: tz,
    status: "booked",
    name: name || null,
    email,
    phone,
    answers: answers ?? null,
    google_event_id: ev.id ?? null,
    meet_url: meetUrl,
    event_link: ev.htmlLink ?? null,
  });
  if (insErr) {
    // The calendar event is the source of truth and it's in; a failed row is a
    // dashboard gap, not a lost booking. Log and still return success.
    console.error("booking-create row insert", insErr.message);
  }

  // Note: the prospect's call reminders are NOT wired here. funnel-lead sets the
  // Booked stage + call time, and the leads_track_appointment DB trigger derives
  // appointment_at from that — which is what the published "EK Booked — …"
  // workflows count down from. So the reminders are built and edited in
  // Automations like any client's, with no hard-coding. This function owns only
  // the Google Calendar event + Meet link.

  return json({ ok: true, booking_id: bookingId, meet_url: meetUrl, event_link: ev.htmlLink ?? null, starts_at: start.toISOString() });
});

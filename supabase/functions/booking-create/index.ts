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

// EstateKit's own people are added to every pitch call as guests, so they're on
// the invite, it lands on their calendar, and Google Meet lets them straight in
// (invited guests never have to "ask to join"). Co-host controls themselves can
// only be granted in Meet/Workspace, not via the Calendar API.
const HOST_GUESTS = ["ousebk@gmail.com", "khushil@estatekit.co", "kieran@estatekit.co"];

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

  // Don't make two cards for a double-tap: if this person already has a live
  // booking at this exact time, hand the same one back. Match on the lead when
  // we know it, otherwise on the email (self-reschedule from the website may
  // not carry the lead id).
  const sameFilter = (q: ReturnType<typeof admin.from>) =>
    leadId ? q.eq("lead_id", leadId) : email ? q.eq("email", email) : q;
  if (leadId || email) {
    const { data: dupe } = await sameFilter(
      admin.from("bookings").select("id, meet_url, event_link, starts_at") as never,
    ).eq("starts_at", start.toISOString()).eq("status", "booked").maybeSingle();
    if (dupe) {
      return json({ ok: true, booking_id: dupe.id, meet_url: dupe.meet_url, event_link: dupe.event_link, starts_at: dupe.starts_at, already: true });
    }
  }

  // A real reschedule: the same person has a live booking at a DIFFERENT time.
  // We create the new one below, then retire the old event + row, so the diary
  // never shows two calls and the prospect's old Google invite is withdrawn.
  // (The lead's call time + stage are moved by the website's funnel step and
  // the leads_track_appointment trigger; this function owns only the calendar.)
  let priorLive: { id: string; google_event_id: string | null; reschedule_count: number | null }[] = [];
  if (leadId || email) {
    const { data: prior } = await sameFilter(
      admin.from("bookings").select("id, google_event_id, reschedule_count") as never,
    ).neq("starts_at", start.toISOString()).eq("status", "booked");
    priorLive = (prior as typeof priorLive) ?? [];
  }
  const rescheduleCount = priorLive.length
    ? Math.max(...priorLive.map((b) => b.reschedule_count ?? 0)) + 1
    : 0;

  const bookingId = crypto.randomUUID();
  const tz = c.time_zone || "Africa/Johannesburg";

  // Claim the slot in the database BEFORE touching Google Calendar. The partial
  // unique index on (slug, starts_at) WHERE status = 'booked' makes this the
  // atomic lock: if two people race for the same time, exactly one INSERT wins
  // and the loser gets 23505 — so no calendar event is ever created for a slot
  // that's already taken. (Google free/busy lags event creation by seconds, so
  // it could never be the real guard.)
  const { error: claimErr } = await admin.from("bookings").insert({
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
    reschedule_count: rescheduleCount,
  });
  if (claimErr) {
    if (claimErr.code === "23505") {
      return json({ ok: false, error: "Someone just took that time. Please pick another.", retry: true }, 409);
    }
    console.error("booking-create claim row", claimErr.message);
    return json({ ok: false, error: "Couldn't book that time just now. Please try again.", retry: true }, 502);
  }

  // The slot is ours now. Any early return from here must release it (delete the
  // holding row), so a failure never leaves the time stuck as booked with no call.
  const release = async () => {
    const { error } = await admin.from("bookings").delete().eq("id", bookingId);
    if (error) console.error("booking-create release row", bookingId, error.message);
  };

  let token: string;
  try {
    token = await saToken(c.calendar_email);
  } catch (err) {
    const msg = String((err as Error)?.message ?? err);
    console.error("booking-create token", msg);
    await release();
    // not-configured / bad-sa-key / scope not granted yet — never shown raw.
    return json({ ok: false, error: "Booking isn't switched on yet. Please try again shortly.", retry: true }, 503);
  }

  // A last-moment free/busy check still guards against times taken on partner@'s
  // calendar outside our bookings table (manual events, staff blocks).
  try {
    const clash = await busyIntervals(token, c.calendar_email, start.toISOString(), new Date(endMs).toISOString());
    const buf = c.buffer_minutes * 60_000;
    if (clash.some(([bs, be]) => startMs - buf < be && endMs + buf > bs)) {
      await release();
      return json({ ok: false, error: "Someone just took that time. Please pick another.", retry: true }, 409);
    }
  } catch (err) {
    console.error("booking-create freebusy", String(err));
    await release();
    return json({ ok: false, error: "Couldn't check the diary just now. Please try again.", retry: true }, 502);
  }

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

  // Prospect + EstateKit's own hosts on the invite. Hosts are added as guests so
  // the call lands on their calendar and Meet admits them without "ask to join".
  const emailLower = (email ?? "").toLowerCase();
  const attendees = [
    ...(email ? [{ email, displayName: name || undefined }] : []),
    ...HOST_GUESTS.filter((g) => g.toLowerCase() !== emailLower).map((g) => ({ email: g })),
  ];

  const event = {
    summary: `EstateKit discovery call — ${name || "new agent"}`,
    description: lines.filter(Boolean).join("\n"),
    start: { dateTime: start.toISOString(), timeZone: tz },
    end: { dateTime: new Date(endMs).toISOString(), timeZone: tz },
    attendees,
    guestsCanInviteOthers: false,
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
    await release();
    return json({ ok: false, error: "Couldn't put the call in the diary. Please try again.", retry: true }, 502);
  }

  const meetUrl: string | null =
    ev.hangoutLink ??
    ev.conferenceData?.entryPoints?.find((e: { entryPointType?: string; uri?: string }) => e.entryPointType === "video")?.uri ??
    null;

  // Fill the calendar details onto the row we already claimed.
  const { error: updErr } = await admin.from("bookings").update({
    google_event_id: ev.id ?? null,
    meet_url: meetUrl,
    event_link: ev.htmlLink ?? null,
  }).eq("id", bookingId);
  if (updErr) {
    // The calendar event is in; a failed update is a dashboard gap, not a lost
    // booking. Log and still return success.
    console.error("booking-create row update", updErr.message);
  }

  // Retire any earlier live booking for this person (a reschedule): pull the old
  // call out of the diary and withdraw its Google invite, then mark the row so
  // the dashboard shows only the new time. Best-effort — the new booking is
  // already saved, so a hiccup here is a tidy-up gap, never a lost call.
  for (const old of priorLive) {
    if (old.google_event_id) {
      try {
        const del = await fetch(
          `${CAL_API}/calendars/${encodeURIComponent(c.calendar_email)}/events/${encodeURIComponent(old.google_event_id)}?sendUpdates=all`,
          { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
        );
        // 404/410 = already gone; anything else we just log.
        if (!del.ok && del.status !== 404 && del.status !== 410) {
          console.error("booking-create retire event", old.id, del.status);
        }
      } catch (err) {
        console.error("booking-create retire event", old.id, String(err));
      }
    }
    const { error: updErr } = await admin.from("bookings")
      .update({ status: "rescheduled", cancelled_at: new Date().toISOString() })
      .eq("id", old.id);
    if (updErr) console.error("booking-create retire row", old.id, updErr.message);
  }

  // Note: the prospect's call reminders are NOT wired here. funnel-lead sets the
  // Booked stage + call time, and the leads_track_appointment DB trigger derives
  // appointment_at from that — which is what the published "EK Booked — …"
  // workflows count down from. So the reminders are built and edited in
  // Automations like any client's, with no hard-coding. This function owns only
  // the Google Calendar event + Meet link.

  return json({ ok: true, booking_id: bookingId, meet_url: meetUrl, event_link: ev.htmlLink ?? null, starts_at: start.toISOString() });
});

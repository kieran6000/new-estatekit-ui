// The funnel booking calendar, for the EstateKit dashboard (operators only).
// Lets staff SEE the estatekit.co/pitch discovery calls and BLOCK OFF times so
// the funnel stops offering them.
//
//   { action: "list", from, to }
//     → { bookings: [...], blocks: [...] } between the two instants.
//       bookings: the real /pitch discovery calls (from the bookings table).
//       blocks:   times staff have blocked off (busy events on partner@,
//                 marked estatekit_block so we can find and lift them).
//   { action: "block", startsAt, endsAt, note? }
//     → writes a busy event to partner@'s Google Calendar. Because the funnel's
//       availability (booking-availability) subtracts partner@'s busy blocks,
//       the blocked time disappears from estatekit.co/pitch within a page-load.
//   { action: "unblock", eventId }
//     → removes one of those block events (only ones we marked).
//
// partner@ is reached by the service account (googleSa), the same as the other
// booking functions — there's no per-agent OAuth here. The dashboard stays the
// one place to run the funnel's diary; partner@'s calendar is the source of
// truth and the funnel reads it live.
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

const BLOCK_MARK = "estatekit_block"; // extendedProperties.private flag on our block events
const isoOrNull = (v: unknown) => {
  if (typeof v !== "string" || !v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
};

interface Cfg { slug: string; time_zone: string; calendar_email: string }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  // Operators only — same gate the other staff tools use.
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: who } = await admin.auth.getUser(jwt);
  const callerId = who?.user?.id;
  if (!callerId) return json({ error: "Not signed in" }, 401);
  const { data: caller } = await admin.from("agent_profiles").select("is_operator, display_name").eq("agent_id", callerId).maybeSingle();
  if (!caller?.is_operator) return json({ error: "Only EstateKit staff can do this." }, 403);

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? "");
  const slug = typeof body?.slug === "string" && body.slug ? body.slug : "pitch";

  const { data: cfgRow } = await admin.from("booking_config").select("slug, time_zone, calendar_email").eq("slug", slug).maybeSingle();
  const cfg = cfgRow as Cfg | null;
  if (!cfg?.calendar_email) return json({ ok: false, error: "The funnel calendar isn't set up yet." }, 409);
  const tz = cfg.time_zone || "Africa/Johannesburg";
  const calendar = cfg.calendar_email;

  let token: string;
  try {
    token = await saToken(calendar);
  } catch (err) {
    console.error("booking-admin token", String((err as Error)?.message ?? err));
    return json({ ok: false, error: "The funnel calendar isn't switched on yet." }, 503);
  }

  // ── List bookings + blocks in a window ──────────────────────────────────
  if (action === "list") {
    const from = isoOrNull(body?.from);
    const to = isoOrNull(body?.to);
    if (!from || !to) return json({ ok: false, error: "Bad request" }, 400);

    const { data: rows, error: bErr } = await admin.from("bookings")
      .select("id, lead_id, starts_at, ends_at, time_zone, status, name, email, phone, meet_url, event_link")
      .eq("slug", slug)
      .neq("status", "cancelled")
      .gte("starts_at", from)
      .lt("starts_at", to)
      .order("starts_at", { ascending: true });
    if (bErr) {
      console.error("booking-admin list bookings", bErr.message);
      return json({ ok: false, error: "Couldn't load the bookings just now." }, 502);
    }

    // Our block events on partner@ in the window.
    let blocks: { id: string; start: string; end: string; note: string }[] = [];
    try {
      const url = new URL(`${CAL_API}/calendars/${encodeURIComponent(calendar)}/events`);
      url.searchParams.set("timeMin", from);
      url.searchParams.set("timeMax", to);
      url.searchParams.set("singleEvents", "true");
      url.searchParams.set("orderBy", "startTime");
      url.searchParams.set("maxResults", "250");
      url.searchParams.set("privateExtendedProperty", `${BLOCK_MARK}=1`);
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message ?? String(res.status));
      blocks = (data?.items ?? [])
        .filter((e: { status?: string }) => e.status !== "cancelled")
        .map((e: { id: string; summary?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string } }) => ({
          id: e.id,
          start: e.start?.dateTime ?? e.start?.date ?? "",
          end: e.end?.dateTime ?? e.end?.date ?? "",
          note: (e.summary ?? "").replace(/^Blocked\s*[—-]\s*/i, "").replace(/^Blocked$/i, "").trim(),
        }))
        .filter((b: { start: string; end: string }) => b.start && b.end);
    } catch (err) {
      // Bookings still return; blocks just come back empty rather than erroring.
      console.error("booking-admin list blocks", String(err));
    }

    return json({ ok: true, time_zone: tz, bookings: rows ?? [], blocks });
  }

  // ── Block off a time ────────────────────────────────────────────────────
  if (action === "block") {
    const startsAt = isoOrNull(body?.startsAt);
    const endsAt = isoOrNull(body?.endsAt);
    if (!startsAt || !endsAt) return json({ ok: false, error: "Pick a start and end time." }, 400);
    if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
      return json({ ok: false, error: "The end time must be after the start time." }, 400);
    }
    const note = String(body?.note ?? "").trim().slice(0, 140);

    const event = {
      summary: note ? `Blocked — ${note}` : "Blocked",
      description: `Blocked off from the EstateKit dashboard by ${caller.display_name ?? "staff"}. The funnel won't offer this time.`,
      start: { dateTime: startsAt, timeZone: tz },
      end: { dateTime: endsAt, timeZone: tz },
      transparency: "opaque", // busy, so booking-availability subtracts it
      reminders: { useDefault: false },
      extendedProperties: { private: { [BLOCK_MARK]: "1", estatekit_slug: slug } },
    };
    const res = await fetch(
      `${CAL_API}/calendars/${encodeURIComponent(calendar)}/events`,
      { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(event) },
    );
    const ev = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("booking-admin block insert", res.status, JSON.stringify(ev?.error ?? ev).slice(0, 300));
      return json({ ok: false, error: "Couldn't block off that time. Please try again." }, 502);
    }
    return json({ ok: true, block: { id: ev.id, start: ev.start?.dateTime ?? startsAt, end: ev.end?.dateTime ?? endsAt, note } });
  }

  // ── Lift a block ────────────────────────────────────────────────────────
  if (action === "unblock") {
    const eventId = String(body?.eventId ?? "").trim();
    if (!eventId) return json({ ok: false, error: "Bad request" }, 400);

    // Only ever remove an event we marked as a block — never a real booking.
    const getRes = await fetch(
      `${CAL_API}/calendars/${encodeURIComponent(calendar)}/events/${encodeURIComponent(eventId)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const got = await getRes.json().catch(() => ({}));
    if (getRes.status === 404 || got?.status === "cancelled") return json({ ok: true, already: true });
    if (!getRes.ok) {
      console.error("booking-admin unblock get", getRes.status, JSON.stringify(got?.error ?? got).slice(0, 300));
      return json({ ok: false, error: "Couldn't remove that block. Please try again." }, 502);
    }
    if (got?.extendedProperties?.private?.[BLOCK_MARK] !== "1") {
      return json({ ok: false, error: "That isn't a blocked time." }, 400);
    }
    const delRes = await fetch(
      `${CAL_API}/calendars/${encodeURIComponent(calendar)}/events/${encodeURIComponent(eventId)}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
    );
    if (!delRes.ok && delRes.status !== 404 && delRes.status !== 410) {
      console.error("booking-admin unblock delete", delRes.status);
      return json({ ok: false, error: "Couldn't remove that block. Please try again." }, 502);
    }
    return json({ ok: true });
  }

  return json({ ok: false, error: "Unknown action" }, 400);
});

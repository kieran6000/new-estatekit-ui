import { supabase } from "./_client";

// The funnel booking calendar (estatekit.co/pitch discovery calls), for staff
// on the dashboard. Backed by supabase/functions/booking-admin — operators
// only. Bookings come from the bookings table; blocks are busy events on
// partner@'s Google Calendar that the funnel reads live, so blocking a time
// here takes it out of estatekit.co/pitch within a page-load.

export interface FunnelBooking {
  id: string;
  lead_id: string | null;
  starts_at: string;
  ends_at: string;
  time_zone: string;
  status: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  meet_url: string | null;
  event_link: string | null;
  reschedule_count?: number | null;
}

/** A time staff have blocked off. `id` is the Google event id (to lift it). */
export interface FunnelBlock { id: string; start: string; end: string; note: string }

export interface FunnelCalendar { bookings: FunnelBooking[]; blocks: FunnelBlock[] }

export async function listFunnelCalendar(from: Date, to: Date): Promise<FunnelCalendar> {
  const { data, error } = await supabase.functions.invoke("booking-admin", {
    body: { action: "list", from: from.toISOString(), to: to.toISOString() },
  });
  if (error || data?.error) throw new Error(data?.error || error?.message || "list");
  return { bookings: data.bookings ?? [], blocks: data.blocks ?? [] };
}

/** Block off a time so the funnel stops offering it. Returns the new block. */
export async function blockFunnelTime(startsAt: string, endsAt: string, note?: string): Promise<FunnelBlock> {
  const { data, error } = await supabase.functions.invoke("booking-admin", {
    body: { action: "block", startsAt, endsAt, note },
  });
  if (error || !data?.ok) throw new Error(data?.error || error?.message || "block");
  return data.block as FunnelBlock;
}

/** Lift a blocked time (by its Google event id). */
export async function unblockFunnelTime(eventId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke("booking-admin", {
    body: { action: "unblock", eventId },
  });
  if (error || !data?.ok) throw new Error(data?.error || error?.message || "unblock");
}

/** Move or resize a block (drag/resize on the calendar). Returns the moved block. */
export async function updateFunnelBlock(eventId: string, startsAt: string, endsAt: string, note?: string): Promise<FunnelBlock> {
  const { data, error } = await supabase.functions.invoke("booking-admin", {
    body: { action: "update_block", eventId, startsAt, endsAt, note },
  });
  if (error || !data?.ok) throw new Error(data?.error || error?.message || "update_block");
  return data.block as FunnelBlock;
}

/** Reschedule a discovery call to a new time (drag-drop). Moves the Google
 *  event, the booking and the lead's call reminder in one go. */
export async function rescheduleFunnelBooking(bookingId: string, startsAt: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke("booking-admin", {
    body: { action: "reschedule", bookingId, startsAt },
  });
  if (error || !data?.ok) throw new Error(data?.error || error?.message || "reschedule");
}

/** Cancel a discovery call: pull it from the diary and stop its reminders. */
export async function cancelFunnelBooking(bookingId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke("booking-admin", {
    body: { action: "cancel", bookingId },
  });
  if (error || !data?.ok) throw new Error(data?.error || error?.message || "cancel");
}

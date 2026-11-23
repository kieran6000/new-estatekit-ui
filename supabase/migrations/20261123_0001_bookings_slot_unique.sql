-- Stop /pitch double-bookings at the database.
--
-- The only cross-person guard in booking-create was a Google free/busy check,
-- which lags a few seconds behind event creation, so two people booking the same
-- slot within seconds both passed and both got a calendar event. This makes the
-- bookings table the atomic slot lock: one live (status = 'booked') booking per
-- (slug, starts_at). booking-create now INSERTs the row to claim the slot before
-- it ever touches Google Calendar, and a 23505 here means "someone just took it".
--
-- Partial index so cancelled / rescheduled rows never block a new booking at the
-- same time. Add-only; there are no duplicate live rows to clear first.
CREATE UNIQUE INDEX IF NOT EXISTS bookings_slot_unique
  ON public.bookings (slug, starts_at)
  WHERE status = 'booked';

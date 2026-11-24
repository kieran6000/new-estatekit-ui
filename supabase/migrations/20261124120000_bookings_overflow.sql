-- Overflow bookings: allow a SECOND booking on a /pitch slot (cap 2) when the
-- whole window is otherwise full, so a closer (Khushil) can cover the overflow.
--
-- Replaces the cap-of-1 guard (bookings_slot_unique) with a cap-of-2 scheme:
-- each live booking on a slot takes a slot_rank (1 = primary, 2 = overflow), and
-- the unique index on (slug, starts_at, slot_rank) makes the claim atomic and
-- hard-caps the slot at two. booking-create inserts rank 1 first; only an
-- overflow booking (offered by booking-availability when the window is full)
-- falls back to rank 2 on a 23505. A normal same-slot race still 23505s on
-- rank 1 and is rejected, so single-booking holds on non-full days.
--
-- Add-only columns; existing booked rows default to slot_rank 1 / overflow false,
-- and there are no current duplicate booked slots, so the new index builds clean.

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS slot_rank smallint NOT NULL DEFAULT 1;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS overflow boolean NOT NULL DEFAULT false;

DROP INDEX IF EXISTS bookings_slot_unique;

CREATE UNIQUE INDEX IF NOT EXISTS bookings_slot_rank_unique
  ON public.bookings (slug, starts_at, slot_rank)
  WHERE status = 'booked';

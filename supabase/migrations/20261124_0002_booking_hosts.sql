-- Per-booking host picker: which EstateKit people are on a given /pitch call.
-- The booking card lets an operator choose who takes the call; booking-admin's
-- set_hosts action invites exactly those people to that booking's Google event
-- (and Meet) and records them here. Empty = prospect only. Never touches the
-- lead or its automations. Add-only.
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS hosts text[] NOT NULL DEFAULT '{}';

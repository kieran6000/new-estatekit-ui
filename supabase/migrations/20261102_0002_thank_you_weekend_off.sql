-- An agent who only gets to weekend leads on Monday, per form. On Saturdays and
-- Sundays the thank-you page says so, and weekends can't be picked for a call.
-- Add-only: one new column, off for every form.
alter table public.lead_pages add column if not exists thank_you_weekend_off boolean not null default false;

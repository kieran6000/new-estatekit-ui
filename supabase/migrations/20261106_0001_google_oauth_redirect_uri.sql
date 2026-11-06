-- Google Calendar: the return address after Google's "Allow" page can be
-- Supabase's (…supabase.co/functions/v1/google-calendar-callback) or our own
-- (leads.estatekit.co/oauth/google/calendar, a Vercel rewrite to the same
-- function), chosen by the vault secret GOOGLE_REDIRECT_URI. The one a
-- Connect started with is kept with its one-time state, because Google only
-- accepts the code with exactly the same address. Add-only.
alter table public.google_oauth_states add column if not exists redirect_uri text;

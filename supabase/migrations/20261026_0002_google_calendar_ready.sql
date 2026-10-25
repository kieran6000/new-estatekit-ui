-- Whether Google Calendar can be connected yet: true once GOOGLE_CLIENT_ID
-- and GOOGLE_CLIENT_SECRET are in the vault. Until then the "Connect your
-- Google Calendar" item isn't shown or counted in Get set up, so agents who
-- are fully set up don't drop to 6 of 7 for a button that can't work yet.
-- Says only yes or no; never the keys. Add-only.
create or replace function public.google_calendar_ready()
returns boolean
language sql
stable
security definer
set search_path = public, vault, pg_temp
as $$
  select count(distinct name) = 2
    from vault.decrypted_secrets
   where name in ('GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET') and coalesce(decrypted_secret, '') <> '';
$$;
revoke all on function public.google_calendar_ready() from public, anon;
grant execute on function public.google_calendar_ready() to authenticated;

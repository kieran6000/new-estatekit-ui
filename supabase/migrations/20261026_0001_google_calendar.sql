-- Google Calendar: an agent connects their own Google account once (Get set
-- up → Connect your Google Calendar), and their appointments (Booked /
-- Viewing Booked) and the call times leads pick go into it by themselves,
-- moving when they move and going when they're cancelled. Add-only.
--
--  * agent_profiles.google_calendar_email: the Google account connected (null
--    = not connected). The only part the app reads; the checklist uses it.
--  * google_calendar_connections: the agent's Google access (refresh token).
--    Server only: no one reads it from the app.
--  * google_calendar_events: which Google event we made for which lead.
--  * google_calendar_queue: leads whose calendar entry needs (re)doing, filled
--    by a trigger on leads, worked through each minute by google-calendar-sync.
--  * google_oauth_states: the one-time codes for the "Connect" round trip.

alter table public.agent_profiles add column if not exists google_calendar_email text;

create table if not exists public.google_calendar_connections (
  agent_id uuid primary key references public.agent_profiles(agent_id) on delete cascade,
  google_email text,
  refresh_token text not null,
  access_token text,
  expires_at timestamptz,
  calendar_id text not null default 'primary',
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  last_error text
);
alter table public.google_calendar_connections enable row level security;
revoke all on public.google_calendar_connections from anon, authenticated;

create table if not exists public.google_calendar_events (
  lead_id uuid not null references public.leads(id) on delete cascade,
  kind text not null check (kind in ('appointment', 'call')),
  agent_id uuid not null,
  google_event_id text not null,
  starts_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (lead_id, kind)
);
alter table public.google_calendar_events enable row level security;
revoke all on public.google_calendar_events from anon, authenticated;

create table if not exists public.google_calendar_queue (
  lead_id uuid not null,
  kind text not null check (kind in ('appointment', 'call')),
  queued_at timestamptz not null default now(),
  attempts int not null default 0,
  primary key (lead_id, kind)
);
alter table public.google_calendar_queue enable row level security;
revoke all on public.google_calendar_queue from anon, authenticated;

create table if not exists public.google_oauth_states (
  state text primary key,
  agent_id uuid not null,
  return_to text,
  created_at timestamptz not null default now()
);
alter table public.google_oauth_states enable row level security;
revoke all on public.google_oauth_states from anon, authenticated;

-- A lead's appointment or call time changed (or the lead did): its calendar
-- entry needs redoing. Only for agents who've connected a calendar.
create or replace function public.queue_calendar_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from google_calendar_connections where agent_id = new.agent_id) then return new; end if;
  if tg_op = 'INSERT'
     or old.appointment_at is distinct from new.appointment_at or old.stage is distinct from new.stage
     or old.archived is distinct from new.archived or old.name is distinct from new.name or old.phone is distinct from new.phone then
    if new.appointment_at is not null or (tg_op = 'UPDATE' and old.appointment_at is not null) then
      insert into google_calendar_queue (lead_id, kind) values (new.id, 'appointment')
      on conflict (lead_id, kind) do update set queued_at = now(), attempts = 0;
    end if;
  end if;
  if tg_op = 'INSERT'
     or old.call_at is distinct from new.call_at or old.stage is distinct from new.stage
     or old.archived is distinct from new.archived or old.name is distinct from new.name or old.phone is distinct from new.phone then
    if new.call_at is not null or (tg_op = 'UPDATE' and old.call_at is not null) then
      insert into google_calendar_queue (lead_id, kind) values (new.id, 'call')
      on conflict (lead_id, kind) do update set queued_at = now(), attempts = 0;
    end if;
  end if;
  return new;
exception when others then
  -- A calendar problem must never stop a lead being saved.
  raise warning 'queue_calendar_sync: %', sqlerrm;
  return new;
end;
$$;
drop trigger if exists leads_queue_calendar_sync on public.leads;
create trigger leads_queue_calendar_sync after insert or update on public.leads
  for each row execute function public.queue_calendar_sync();

-- Each minute: put what changed into people's calendars.
select cron.schedule(
  'google-calendar-sync-every-minute',
  '* * * * *',
  $cron$
  select net.http_post(
    url := 'https://yfcnsvrhojpysrzqrkdi.supabase.co/functions/v1/google-calendar-sync',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $cron$
)
where not exists (select 1 from cron.job where jobname = 'google-calendar-sync-every-minute');

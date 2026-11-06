-- Google Calendar, round 2. Add-only.
--
-- What changes for agents:
--  * Follow-up reminders (what "How did it go?" sets: Spoke, following up →
--    tomorrow / in 2 days / next week / a date) go into Google Calendar too,
--    as a third kind of entry next to appointments and picked call times.
--  * The connection lives on Account (and still on Get set up). When Google
--    stops letting us in, the connection is kept but marked needs_reconnect,
--    so the app can say "Reconnect" instead of silently doing nothing.
--
-- What changes underneath:
--  * Queue rows are claimed (claimed_until) before they're worked on, so the
--    cron and an on-the-spot sync (google-calendar, action "sync") never work
--    the same row at once; failures back off (retry_at) instead of being
--    retried every minute.
--  * google_calendar_trash: a lead that's deleted (merges) takes its tracking
--    row with it (ON DELETE CASCADE); its upcoming Google event is noted here
--    so the worker can still take it out of their calendar.
--  * google_calendar_status(): what the app may know about a connection
--    (never the tokens). google_calendar_queue_upcoming(): everything coming
--    up for one agent, queued (on connect).
--  * The cron only calls the function when there's something to do, and
--    sends a key the function checks (GOOGLE_CALENDAR_CRON_KEY, generated
--    here, never leaves the database and the function).
--  * GOOGLE_TOKEN_KEY (generated here): the edge functions seal refresh and
--    access tokens with it (AES-GCM) before they're stored.

-- 1. Follow-ups: a third kind of entry.
alter table public.google_calendar_events drop constraint if exists google_calendar_events_kind_check;
alter table public.google_calendar_events add constraint google_calendar_events_kind_check
  check (kind in ('appointment', 'call', 'followup'));
alter table public.google_calendar_queue drop constraint if exists google_calendar_queue_kind_check;
alter table public.google_calendar_queue add constraint google_calendar_queue_kind_check
  check (kind in ('appointment', 'call', 'followup'));

-- 2. New columns.
alter table public.google_calendar_events add column if not exists html_link text;
alter table public.google_calendar_connections add column if not exists needs_reconnect boolean not null default false;
alter table public.google_calendar_connections add column if not exists time_zone text;
alter table public.google_calendar_queue add column if not exists claimed_until timestamptz;
alter table public.google_calendar_queue add column if not exists retry_at timestamptz;
alter table public.google_oauth_states add column if not exists code_verifier text;
alter table public.google_oauth_states add column if not exists origin text;

create index if not exists google_calendar_events_agent_starts
  on public.google_calendar_events (agent_id, starts_at);

-- 3. Upcoming events whose lead was deleted.
create table if not exists public.google_calendar_trash (
  agent_id uuid not null,
  google_event_id text not null,
  starts_at timestamptz,
  queued_at timestamptz not null default now(),
  attempts int not null default 0,
  retry_at timestamptz,
  primary key (agent_id, google_event_id)
);
alter table public.google_calendar_trash enable row level security;
revoke all on public.google_calendar_trash from anon, authenticated;

create or replace function public.trash_orphaned_calendar_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only when the lead itself is gone (the cascade), and only what's still to
  -- come: the worker deleting its own rows leaves the lead in place.
  if old.starts_at is not null and old.starts_at > now()
     and not exists (select 1 from leads where id = old.lead_id) then
    insert into google_calendar_trash (agent_id, google_event_id, starts_at)
    values (old.agent_id, old.google_event_id, old.starts_at)
    on conflict do nothing;
  end if;
  return old;
exception when others then
  raise warning 'trash_orphaned_calendar_event: %', sqlerrm;
  return old;
end;
$$;
drop trigger if exists google_calendar_events_trash on public.google_calendar_events;
create trigger google_calendar_events_trash after delete on public.google_calendar_events
  for each row execute function public.trash_orphaned_calendar_event();

-- 4. Queueing. One helper so every path resets the row the same way: a fresh
--    change is worked on straight away (attempts and back-off cleared), but a
--    row a worker holds right now stays held (claimed_until untouched); the
--    worker sees queued_at moved and leaves it for the next pass.
--    clock_timestamp(), not now(): now() is fixed for a whole transaction, so
--    two changes in one transaction would look like no change at all.
create or replace function public.queue_calendar_item(p_lead uuid, p_kind text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into google_calendar_queue (lead_id, kind, queued_at) values (p_lead, p_kind, clock_timestamp())
  on conflict (lead_id, kind) do update set queued_at = clock_timestamp(), attempts = 0, retry_at = null;
$$;

create or replace function public.queue_calendar_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  moved boolean := tg_op = 'UPDATE' and old.agent_id is distinct from new.agent_id;
  basics boolean;
begin
  -- Only for agents with a working connection, or a lead leaving one (its
  -- entries come out of the old agent's calendar).
  if not exists (select 1 from google_calendar_connections where agent_id = new.agent_id and not needs_reconnect)
     and not (moved and exists (select 1 from google_calendar_connections where agent_id = old.agent_id)) then
    return new;
  end if;
  -- What every entry shows or depends on.
  basics := tg_op = 'INSERT' or moved
    or old.stage is distinct from new.stage or old.archived is distinct from new.archived
    or old.name is distinct from new.name or old.phone is distinct from new.phone
    or old.note is distinct from new.note or old.pipeline_id is distinct from new.pipeline_id;

  if (basics or old.appointment_at is distinct from new.appointment_at or old.form_answers is distinct from new.form_answers)
     and (new.appointment_at is not null or (tg_op = 'UPDATE' and old.appointment_at is not null)) then
    perform queue_calendar_item(new.id, 'appointment');
  end if;

  if (basics or old.call_at is distinct from new.call_at)
     and (new.call_at is not null or (tg_op = 'UPDATE' and old.call_at is not null)) then
    perform queue_calendar_item(new.id, 'call');
  end if;

  -- A follow-up is skipped when it's the same moment as the appointment or
  -- call time, so those changing can add or remove it too.
  if (basics or old.reminder_at is distinct from new.reminder_at or old.next_label is distinct from new.next_label
      or old.call_at is distinct from new.call_at or old.appointment_at is distinct from new.appointment_at)
     and (new.reminder_at is not null or (tg_op = 'UPDATE' and old.reminder_at is not null)) then
    perform queue_calendar_item(new.id, 'followup');
  end if;
  return new;
exception when others then
  -- A calendar problem must never stop a lead being saved.
  raise warning 'queue_calendar_sync: %', sqlerrm;
  return new;
end;
$$;
-- (The trigger leads_queue_calendar_sync from 20261026_0001 calls this.)

-- 5. Working the queue.
--    claim: up to p_limit rows nobody holds, oldest first, held for 90s. With
--    p_lead, just that lead's rows, back-off ignored (someone just saved it).
create or replace function public.google_calendar_claim(p_limit int default 40, p_lead uuid default null)
returns table (lead_id uuid, kind text, attempts int, queued_at timestamptz)
language sql
security definer
set search_path = public
as $$
  update google_calendar_queue q
     set claimed_until = now() + interval '90 seconds'
    from (
      select g.lead_id, g.kind
        from google_calendar_queue g
       where (g.claimed_until is null or g.claimed_until < now())
         and (p_lead is not null or g.retry_at is null or g.retry_at <= now())
         and (p_lead is null or g.lead_id = p_lead)
       order by g.queued_at
       limit greatest(1, least(coalesce(p_limit, 40), 200))
         for update skip locked
    ) c
   where q.lead_id = c.lead_id and q.kind = c.kind
  returning q.lead_id, q.kind, q.attempts, q.queued_at;
$$;

--    done: the row goes, unless the lead changed again while it was being
--    worked on (queued_at moved): then it's let go for the next pass.
create or replace function public.google_calendar_done(p_lead uuid, p_kind text, p_queued_at timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from google_calendar_queue where lead_id = p_lead and kind = p_kind and queued_at = p_queued_at;
  if not found then
    update google_calendar_queue set claimed_until = null where lead_id = p_lead and kind = p_kind;
  end if;
end;
$$;

--    retry: try again later (2, 4, 8, 16 minutes…), giving up after 6 tries.
--    Returns true when it gave up.
create or replace function public.google_calendar_retry(p_lead uuid, p_kind text, p_queued_at timestamptz)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  select attempts into n from google_calendar_queue
   where lead_id = p_lead and kind = p_kind and queued_at = p_queued_at;
  if not found then
    -- Changed meanwhile: a fresh row, worked on next pass.
    update google_calendar_queue set claimed_until = null where lead_id = p_lead and kind = p_kind;
    return false;
  end if;
  if n + 1 >= 6 then
    delete from google_calendar_queue where lead_id = p_lead and kind = p_kind;
    return true;
  end if;
  update google_calendar_queue
     set attempts = n + 1, claimed_until = null, retry_at = now() + make_interval(mins => power(2, n + 1)::int)
   where lead_id = p_lead and kind = p_kind;
  return false;
end;
$$;

-- 6. Everything coming up for one agent (on connect). The worker decides
--    what actually belongs in their calendar.
create or replace function public.google_calendar_queue_upcoming(p_agent uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  insert into google_calendar_queue (lead_id, kind, queued_at)
  select l.id, v.k, clock_timestamp()
    from leads l
   cross join lateral (values ('appointment', l.appointment_at), ('call', l.call_at), ('followup', l.reminder_at)) v(k, at)
   where l.agent_id = p_agent and not l.archived
     and v.at > now() and v.at < now() + interval '400 days'
  on conflict (lead_id, kind) do update set queued_at = clock_timestamp(), attempts = 0, retry_at = null;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- 7. What the app may know about a connection: the signed-in agent's own, or
--    any agent's for an operator. Never a token.
create or replace function public.google_calendar_status(p_agent uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  me uuid := auth.uid();
  target uuid := coalesce(p_agent, auth.uid());
  c google_calendar_connections%rowtype;
begin
  if me is null then return null; end if;
  if target <> me and not public.is_operator() then return null; end if;
  select * into c from google_calendar_connections where agent_id = target;
  return jsonb_build_object(
    'ready', public.google_calendar_ready(),
    'connected', c.agent_id is not null,
    'email', c.google_email,
    'needs_reconnect', coalesce(c.needs_reconnect, false),
    'connected_at', c.connected_at,
    'last_synced_at', c.last_synced_at,
    'last_error', c.last_error,
    'pending', (select count(*) from google_calendar_queue q join leads l on l.id = q.lead_id where l.agent_id = target),
    'upcoming', (
      select coalesce(jsonb_object_agg(x.kind, x.n), '{}'::jsonb)
        from (select e.kind, count(*) n from google_calendar_events e
               where e.agent_id = target and e.starts_at > now() group by e.kind) x
    )
  );
end;
$$;

-- Server-only helpers: nobody calls these from the app.
revoke all on function public.trash_orphaned_calendar_event() from public, anon, authenticated;
revoke all on function public.queue_calendar_item(uuid, text) from public, anon, authenticated;
revoke all on function public.queue_calendar_sync() from public, anon, authenticated;
revoke all on function public.google_calendar_claim(int, uuid) from public, anon, authenticated;
revoke all on function public.google_calendar_done(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.google_calendar_retry(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.google_calendar_queue_upcoming(uuid) from public, anon, authenticated;
grant execute on function public.google_calendar_claim(int, uuid) to service_role;
grant execute on function public.google_calendar_done(uuid, text, timestamptz) to service_role;
grant execute on function public.google_calendar_retry(uuid, text, timestamptz) to service_role;
grant execute on function public.google_calendar_queue_upcoming(uuid) to service_role;
-- The app's one read.
revoke all on function public.google_calendar_status(uuid) from public, anon;
grant execute on function public.google_calendar_status(uuid) to authenticated, service_role;

-- 8. Keys generated in the database (their values never appear anywhere else).
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'GOOGLE_CALENDAR_CRON_KEY') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'GOOGLE_CALENDAR_CRON_KEY',
      'google-calendar-sync: the cron''s caller key');
  end if;
  if not exists (select 1 from vault.secrets where name = 'GOOGLE_TOKEN_KEY') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'GOOGLE_TOKEN_KEY',
      'AES-256-GCM key sealing Google Calendar tokens at rest');
  end if;
end;
$$;

-- 9. The cron: each minute, only when there's work, with its key. (It was
--    switched off; it's harmless now while nobody is connected, since the
--    queue stays empty.)
select cron.schedule(
  'google-calendar-sync-every-minute',
  '* * * * *',
  $cron$
  select net.http_post(
    url := 'https://yfcnsvrhojpysrzqrkdi.supabase.co/functions/v1/google-calendar-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-key', (select decrypted_secret from vault.decrypted_secrets where name = 'GOOGLE_CALENDAR_CRON_KEY')
    ),
    body := '{}'::jsonb
  )
  where exists (
          select 1 from public.google_calendar_queue
           where (claimed_until is null or claimed_until < now()) and (retry_at is null or retry_at <= now()))
     or exists (
          select 1 from public.google_calendar_trash where retry_at is null or retry_at <= now());
  $cron$
);
select cron.alter_job(jobid, active := true) from cron.job where jobname = 'google-calendar-sync-every-minute';

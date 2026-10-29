-- Call time from a Facebook instant form's thank-you page. The end-screen
-- button can't carry who the person is, so on that page they type their
-- number once and pick a time; we save it on their lead:
--   * straight away, when their lead is already here (same agent, same
--     number in any format, in the last 3 days), or
--   * the moment it arrives. Instant-form leads are collected every 15
--     minutes, so they usually land after the person is on the page.
-- Same result as set_call_time (their answer on the lead + a history line),
-- so the call alert and reminders follow as for any picked time. Add-only.

-- One key for "same number whatever the format": 0821234567, 82 123 4567,
-- +27 82 123 4567 and 27821234567 are all 27821234567.
create or replace function public.call_key(p text)
returns text language sql immutable set search_path = public as $$
  select case when d ~ '^0[0-9]{9}$' then '27' || substr(d, 2)
              when d ~ '^[6-8][0-9]{8}$' then '27' || d
              else d end
  from (select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') as d) x;
$$;

-- Times asked for on a thank-you page, waiting for (or matched to) a lead.
-- No policies: only the functions below read or write it.
create table if not exists public.call_time_requests (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.lead_pages(id) on delete cascade,
  agent_id uuid not null,
  phone_key text not null,
  value text not null,
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  lead_id uuid references public.leads(id) on delete set null
);
alter table public.call_time_requests enable row level security;
create index if not exists call_time_requests_waiting on public.call_time_requests (agent_id, phone_key) where applied_at is null;
create index if not exists call_time_requests_recent on public.call_time_requests (phone_key, created_at);

-- The call time on a lead, as set_call_time does it. Internal.
create or replace function public.apply_call_time(p_lead uuid, p_value text)
returns void language plpgsql security definer set search_path = public as $$
declare
  l record;
  q constant text := 'When suits you for a quick call?';
  answers jsonb;
begin
  select id, agent_id, form_answers into l from leads where id = p_lead;
  if l.id is null then return; end if;
  select coalesce(jsonb_agg(e), '[]'::jsonb) into answers
  from jsonb_array_elements(case when jsonb_typeof(l.form_answers) = 'array' then l.form_answers else '[]'::jsonb end) e
  where e->>'q' is distinct from q;
  update leads set form_answers = answers || jsonb_build_array(jsonb_build_object('q', q, 'a', p_value)) where id = l.id;
  insert into lead_events (lead_id, agent_id, event_type, to_value, source)
  values (l.id, l.agent_id, 'call_time_set', p_value, 'website');
end $$;
revoke all on function public.apply_call_time(uuid, text) from public, anon, authenticated;

-- What the thank-you page calls. true = we have it (saved now or waiting
-- for their lead); it never says whether a lead exists for that number.
create or replace function public.request_call_time(p_slug text, p_phone text, p_value text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  pg record;
  k text := call_key(p_phone);
  v text := btrim(coalesce(p_value, ''));
  r_id uuid;
  l_id uuid;
begin
  if p_slug is null or length(p_slug) > 80 then return false; end if;
  if length(k) < 9 or length(k) > 15 then return false; end if;
  -- e.g. "Fri 17 Oct, around 10:00"
  if length(v) < 8 or length(v) > 60 or v !~ ', around [0-2][0-9]:[0-5][0-9]$' then return false; end if;

  select id, agent_id into pg from lead_pages where slug = p_slug and thank_you_ask_call = true;
  if pg.id is null then return false; end if;

  -- Throttle: a number can ask 5 times a day, a page 120 times an hour.
  if (select count(*) from call_time_requests where phone_key = k and created_at > now() - interval '1 day') >= 5 then return false; end if;
  if (select count(*) from call_time_requests where page_id = pg.id and created_at > now() - interval '1 hour') >= 120 then return false; end if;

  insert into call_time_requests (page_id, agent_id, phone_key, value) values (pg.id, pg.agent_id, k, v) returning id into r_id;

  select id into l_id from leads
   where agent_id = pg.agent_id and not archived and call_key(phone) = k and created_at > now() - interval '3 days'
   order by created_at desc limit 1;
  if l_id is not null then
    perform apply_call_time(l_id, v);
    update call_time_requests set applied_at = now(), lead_id = l_id where id = r_id;
  end if;
  return true;
end $$;
grant execute on function public.request_call_time(text, text, text) to anon, authenticated;

-- A lead arrives: if its person already picked a time, it goes on the lead.
-- Never blocks a lead from arriving.
create or replace function public.apply_pending_call_times()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record;
begin
  begin
    select id, value into r from call_time_requests
     where applied_at is null and agent_id = new.agent_id and phone_key = call_key(new.phone) and created_at > now() - interval '3 days'
     order by created_at desc limit 1;
    if r.id is not null then
      perform apply_call_time(new.id, r.value);
      update call_time_requests set applied_at = now(), lead_id = new.id where id = r.id;
    end if;
  exception when others then
    null;
  end;
  return null;
end $$;

drop trigger if exists leads_apply_call_time_request on public.leads;
create trigger leads_apply_call_time_request after insert on public.leads
  for each row execute function public.apply_pending_call_times();

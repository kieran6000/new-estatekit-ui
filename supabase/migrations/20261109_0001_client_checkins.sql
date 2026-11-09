-- Check-ins: how happy each client is, and what needs doing for them.
-- Add-only: two new tables and two functions for the public form.
--
--  * client_checkins: one weekly check-in link per send. The client opens
--    /k/<token> (no login, no name to type), taps five 1-5 ratings and can
--    add a comment. One answer per link; links stop working after 21 days.
--  * client_notes: the team's to-dos for a client (ticked off when done) and
--    notes, like a call summary with its recording link.
-- Only staff (is_operator) can read or write either. The public form only
-- goes through get_checkin / submit_checkin, which see nothing but the one
-- check-in the link is for.

create table if not exists public.client_checkins (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null,
  token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  created_by uuid default auth.uid(),
  created_by_name text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '21 days',
  shared_at timestamptz,
  first_opened_at timestamptz,
  answered_at timestamptz,
  -- {"quality": 1-5, "volume": 1-5, "followup": 1-5, "confidence": 1-5, "happiness": 1-5}
  answers jsonb,
  comment text
);
create index if not exists client_checkins_agent on public.client_checkins (agent_id, created_at desc);

alter table public.client_checkins enable row level security;
drop policy if exists "Staff read check-ins" on public.client_checkins;
create policy "Staff read check-ins" on public.client_checkins
  for select to authenticated using (coalesce(public.is_operator(), false));
drop policy if exists "Staff send check-ins" on public.client_checkins;
create policy "Staff send check-ins" on public.client_checkins
  for insert to authenticated with check (coalesce(public.is_operator(), false));
drop policy if exists "Staff mark check-ins sent" on public.client_checkins;
create policy "Staff mark check-ins sent" on public.client_checkins
  for update to authenticated using (coalesce(public.is_operator(), false));
drop policy if exists "Staff delete unanswered check-ins" on public.client_checkins;
create policy "Staff delete unanswered check-ins" on public.client_checkins
  for delete to authenticated using (coalesce(public.is_operator(), false) and answered_at is null);
revoke all on public.client_checkins from anon, authenticated;
grant select, insert, delete on public.client_checkins to authenticated;
grant update (shared_at) on public.client_checkins to authenticated;

create table if not exists public.client_notes (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null,
  kind text not null default 'todo' check (kind in ('todo', 'note')),
  body text not null check (length(trim(body)) between 1 and 2000),
  link text check (link is null or link ~ '^https://'),
  created_by uuid default auth.uid(),
  created_by_name text,
  created_at timestamptz not null default now(),
  done_at timestamptz,
  done_by_name text
);
create index if not exists client_notes_agent on public.client_notes (agent_id, created_at desc);

alter table public.client_notes enable row level security;
drop policy if exists "Staff use client notes" on public.client_notes;
create policy "Staff use client notes" on public.client_notes
  for all to authenticated
  using (coalesce(public.is_operator(), false))
  with check (coalesce(public.is_operator(), false));
revoke all on public.client_notes from anon, authenticated;
grant select, insert, update, delete on public.client_notes to authenticated;

-- What the public form needs: the client's first name and whether it can still
-- be answered. Opening it is noted (not by staff looking at it themselves).
create or replace function public.get_checkin(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.client_checkins;
  first text;
begin
  select * into r from public.client_checkins where token = p_token;
  if not found then
    return null;
  end if;
  select split_part(trim(coalesce(display_name, '')), ' ', 1) into first from public.agent_profiles where agent_id = r.agent_id;
  if r.answered_at is null and r.expires_at > now() and not coalesce(public.is_operator(), false) then
    update public.client_checkins set first_opened_at = coalesce(first_opened_at, now()) where id = r.id;
  end if;
  return jsonb_build_object(
    'first_name', coalesce(first, ''),
    'agent_id', r.agent_id,
    'status', case when r.answered_at is not null then 'answered' when r.expires_at <= now() then 'expired' else 'open' end
  );
end;
$$;
revoke all on function public.get_checkin(text) from public;
grant execute on function public.get_checkin(text) to anon, authenticated;

-- The answers: five whole numbers 1-5 and an optional comment, once per link.
create or replace function public.submit_checkin(p_token text, p_answers jsonb, p_comment text) returns text
language plpgsql security definer set search_path = public as $$
declare
  r public.client_checkins;
  k text;
  v int;
  clean jsonb := '{}'::jsonb;
begin
  select * into r from public.client_checkins where token = p_token for update;
  if not found then
    return 'invalid';
  end if;
  if r.answered_at is not null then
    return 'answered';
  end if;
  if r.expires_at <= now() then
    return 'expired';
  end if;
  foreach k in array array['quality', 'volume', 'followup', 'confidence', 'happiness'] loop
    begin
      v := (p_answers ->> k)::int;
    exception when others then
      return 'incomplete';
    end;
    if v is null or v < 1 or v > 5 then
      return 'incomplete';
    end if;
    clean := clean || jsonb_build_object(k, v);
  end loop;
  update public.client_checkins
    set answers = clean,
        comment = nullif(left(trim(coalesce(p_comment, '')), 2000), ''),
        answered_at = now(),
        first_opened_at = coalesce(first_opened_at, now())
    where id = r.id;
  return 'ok';
end;
$$;
revoke all on function public.submit_checkin(text, jsonb, text) from public;
grant execute on function public.submit_checkin(text, jsonb, text) to anon, authenticated;

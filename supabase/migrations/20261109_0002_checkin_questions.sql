-- Check-ins, round 2. Add-only.
--  * The team can change the questions (kept in app_settings, key
--    'checkin_questions'). Each check-in keeps a copy of the questions it was
--    sent with (client_checkins.questions), so old answers still read right
--    after the questions change.
--  * Answers are whatever those questions ask: 1-5 for a rating, words for a
--    written one. A rating must be answered; a written one is optional.

alter table public.client_checkins add column if not exists questions jsonb;

-- The questions every check-in had before they could be changed.
create or replace function public.checkin_default_questions() returns jsonb
language sql immutable as $$
  select '[
    {"id": "quality", "type": "rating", "label": "How good were your leads this week?", "short": "Lead quality", "low": "Poor", "high": "Great"},
    {"id": "volume", "type": "rating", "label": "Did you get enough leads this week?", "short": "Enough leads", "low": "Far too few", "high": "Plenty"},
    {"id": "followup", "type": "rating", "label": "How well did you follow up with your leads?", "short": "Follow-up", "low": "Hardly", "high": "Every one"},
    {"id": "confidence", "type": "rating", "label": "How confident are you turning these leads into listings?", "short": "Confidence", "low": "Not at all", "high": "Very"},
    {"id": "happiness", "type": "rating", "label": "How happy are you with EstateKit this week?", "short": "Happy with us", "low": "Unhappy", "high": "Very happy"},
    {"id": "better", "type": "text", "label": "One thing we could do better?", "short": "Could do better"}
  ]'::jsonb;
$$;

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
    'questions', coalesce(r.questions, public.checkin_default_questions()),
    'status', case when r.answered_at is not null then 'answered' when r.expires_at <= now() then 'expired' else 'open' end
  );
end;
$$;
revoke all on function public.get_checkin(text) from public;
grant execute on function public.get_checkin(text) to anon, authenticated;

create or replace function public.submit_checkin(p_token text, p_answers jsonb, p_comment text) returns text
language plpgsql security definer set search_path = public as $$
declare
  r public.client_checkins;
  q jsonb;
  id text;
  v int;
  t text;
  clean jsonb := '{}'::jsonb;
  written text;
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
  for q in select * from jsonb_array_elements(coalesce(r.questions, public.checkin_default_questions())) loop
    id := q ->> 'id';
    if coalesce(q ->> 'type', 'rating') = 'text' then
      t := left(trim(coalesce(p_answers ->> id, '')), 2000);
      if t <> '' then
        clean := clean || jsonb_build_object(id, t);
        written := coalesce(written, t);
      end if;
    else
      begin
        v := (p_answers ->> id)::int;
      exception when others then
        return 'incomplete';
      end;
      if v is null or v < 1 or v > 5 then
        return 'incomplete';
      end if;
      clean := clean || jsonb_build_object(id, v);
    end if;
  end loop;
  update public.client_checkins
    set answers = clean,
        comment = nullif(left(trim(coalesce(nullif(trim(coalesce(p_comment, '')), ''), written, '')), 2000), ''),
        answered_at = now(),
        first_opened_at = coalesce(first_opened_at, now())
    where id = r.id;
  return 'ok';
end;
$$;
revoke all on function public.submit_checkin(text, jsonb, text) from public;
grant execute on function public.submit_checkin(text, jsonb, text) to anon, authenticated;

-- To-dos and notes can be formatted (bold, lists, links) and hold screenshots,
-- so they're kept as HTML: room for more than plain text.
alter table public.client_notes drop constraint if exists client_notes_body_check;
alter table public.client_notes add constraint client_notes_body_check check (length(trim(body)) between 1 and 50000);

-- Screenshots in notes are private to staff: a private bucket, read through
-- short-lived links.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('client-notes', 'client-notes', false, 10485760, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do nothing;
drop policy if exists "Staff read note images" on storage.objects;
create policy "Staff read note images" on storage.objects
  for select to authenticated using (bucket_id = 'client-notes' and coalesce(public.is_operator(), false));
drop policy if exists "Staff add note images" on storage.objects;
create policy "Staff add note images" on storage.objects
  for insert to authenticated with check (bucket_id = 'client-notes' and coalesce(public.is_operator(), false));
drop policy if exists "Staff remove note images" on storage.objects;
create policy "Staff remove note images" on storage.objects
  for delete to authenticated using (bucket_id = 'client-notes' and coalesce(public.is_operator(), false));

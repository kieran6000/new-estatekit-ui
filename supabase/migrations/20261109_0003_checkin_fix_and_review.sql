-- Check-ins, round 3. Add-only.
--  * submit_checkin: a variable called "id" clashed with the id column, so
--    every answer failed. Same function, variable renamed.
--  * get_checkin also hands the form the Google review link (app_settings key
--    'google_review_link'), so it can ask very happy clients for a review.

create or replace function public.submit_checkin(p_token text, p_answers jsonb, p_comment text) returns text
language plpgsql security definer set search_path = public as $$
declare
  r public.client_checkins;
  q jsonb;
  qid text;
  v int;
  t text;
  clean jsonb := '{}'::jsonb;
  written text;
begin
  select * into r from public.client_checkins c where c.token = p_token for update;
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
    qid := q ->> 'id';
    if coalesce(q ->> 'type', 'rating') = 'text' then
      t := left(trim(coalesce(p_answers ->> qid, '')), 2000);
      if t <> '' then
        clean := clean || jsonb_build_object(qid, t);
        written := coalesce(written, t);
      end if;
    else
      begin
        v := (p_answers ->> qid)::int;
      exception when others then
        return 'incomplete';
      end;
      if v is null or v < 1 or v > 5 then
        return 'incomplete';
      end if;
      clean := clean || jsonb_build_object(qid, v);
    end if;
  end loop;
  update public.client_checkins c
    set answers = clean,
        comment = nullif(left(trim(coalesce(nullif(trim(coalesce(p_comment, '')), ''), written, '')), 2000), ''),
        answered_at = now(),
        first_opened_at = coalesce(c.first_opened_at, now())
    where c.id = r.id;
  return 'ok';
end;
$$;
revoke all on function public.submit_checkin(text, jsonb, text) from public;
grant execute on function public.submit_checkin(text, jsonb, text) to anon, authenticated;

create or replace function public.get_checkin(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.client_checkins;
  first text;
  review text;
begin
  select * into r from public.client_checkins c where c.token = p_token;
  if not found then
    return null;
  end if;
  select split_part(trim(coalesce(display_name, '')), ' ', 1) into first from public.agent_profiles where agent_id = r.agent_id;
  select trim(value) into review from public.app_settings where key = 'google_review_link';
  if review !~* '^https://\S+$' then
    review := null;
  end if;
  if r.answered_at is null and r.expires_at > now() and not coalesce(public.is_operator(), false) then
    update public.client_checkins c set first_opened_at = coalesce(c.first_opened_at, now()) where c.id = r.id;
  end if;
  return jsonb_build_object(
    'first_name', coalesce(first, ''),
    'agent_id', r.agent_id,
    'questions', coalesce(r.questions, public.checkin_default_questions()),
    'review_link', review,
    'status', case when r.answered_at is not null then 'answered' when r.expires_at <= now() then 'expired' else 'open' end
  );
end;
$$;
revoke all on function public.get_checkin(text) from public;
grant execute on function public.get_checkin(text) to anon, authenticated;

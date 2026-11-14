-- The book-a-call page (/call/<code>): a lead picks a day and time for a
-- call, the same picker as the thank-you page, from a link in an email or
-- WhatsApp ({{call_link}}). The code is the lead's private code (plan_token);
-- saving still goes through set_call_time. Add-only: one read-only function.
--
-- get_call_booking(code): what the page shows. The lead's first name, the
-- agent's name, photo and brand colour, the form's call question and
-- "no weekends" setting, and the time they picked before (if any). Nothing
-- for an unknown code, an archived lead or an account that's been switched off.
create or replace function public.get_call_booking(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  l record;
  a record;
  pg record;
  v_photo text;
  v_logo text;
  v_time text;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{32}$' then return null; end if;

  select id, name, agent_id, source_page_id, form_answers into l
  from leads where plan_token = p_token and not archived;
  if l.id is null then return null; end if;

  select display_name, avatar_url, sidebar_color, sidebar_logo_url into a
  from agent_profiles where agent_id = l.agent_id and deactivated_at is null;
  if not found then return null; end if;

  select accent_color, logo_data_url, profile_photo_data_url, thank_you_call_question, thank_you_weekend_off into pg
  from lead_pages where id = l.source_page_id;

  v_photo := coalesce(pg.profile_photo_data_url, a.avatar_url);
  v_logo := coalesce(pg.logo_data_url, a.sidebar_logo_url);
  select e->>'a' into v_time
  from jsonb_array_elements(case when jsonb_typeof(l.form_answers) = 'array' then l.form_answers else '[]'::jsonb end) e
  where e->>'q' = 'When suits you for a quick call?'
  limit 1;

  return jsonb_build_object(
    'lead_name', split_part(btrim(coalesce(l.name, '')), ' ', 1),
    'agent_name', coalesce(a.display_name, ''),
    'photo', case when v_photo ~ '^(https://|data:image/)' then v_photo end,
    'logo', case when v_logo ~ '^(https://|data:image/)' then v_logo end,
    'accent', coalesce(pg.accent_color, a.sidebar_color, '#1976d2'),
    'question', nullif(btrim(coalesce(pg.thank_you_call_question, '')), ''),
    'no_weekends', coalesce(pg.thank_you_weekend_off, false),
    'call_time', v_time
  );
end;
$$;
revoke all on function public.get_call_booking(text) from public;
grant execute on function public.get_call_booking(text) to anon, authenticated;

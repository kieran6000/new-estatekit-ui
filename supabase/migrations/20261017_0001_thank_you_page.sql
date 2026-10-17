-- Thank-you page options per form, and saving a call time picked there.
-- Add-only: two new columns, one new history type, one new function.
--
--  * lead_pages.thank_you_video_url: a short video at the top of the
--    thank-you page (YouTube, Vimeo, Bunny/Wistia link or an .mp4).
--  * lead_pages.thank_you_ask_call: ask "When suits you for a quick call?" on
--    the thank-you page (leads from our own forms only: from a Facebook
--    instant form we don't know who is on the page).
--  * set_call_time(token, value): saves the time on the lead (as an answer,
--    "When suits you for a quick call?") and notes it in the lead's history.
--    Uses the lead's own private code, like the marketing plan link.

alter table public.lead_pages add column if not exists thank_you_video_url text;
alter table public.lead_pages add column if not exists thank_you_ask_call boolean not null default false;

alter table public.lead_events drop constraint if exists lead_events_event_type_check;
alter table public.lead_events add constraint lead_events_event_type_check check (
  event_type = any (array[
    'created', 'stage_changed', 'note_changed', 'archived', 'restored', 'pipeline_moved', 'call', 'whatsapp_sent',
    'email_sent', 'email_failed', 'email_delivered', 'email_delayed', 'email_bounced', 'email_complained',
    'email_opened', 'email_clicked', 'plan_opened', 'plan_pdf_opened', 'workflow_email', 'workflow_email_opened',
    'tagged', 'email_unsubscribed', 'capi_reported',
    'call_time_set'
  ])
);

create or replace function public.set_call_time(p_token text, p_value text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  l record;
  v text := btrim(coalesce(p_value, ''));
  q constant text := 'When suits you for a quick call?';
  answers jsonb;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{32}$' then return false; end if;
  -- e.g. "Fri 17 Oct, around 10:00"
  if length(v) < 8 or length(v) > 60 or v !~ ', around [0-2][0-9]:[0-5][0-9]$' then return false; end if;

  select id, agent_id, form_answers into l from leads where plan_token = p_token;
  if l.id is null then return false; end if;

  -- Replace an earlier answer to the same question (they changed their mind).
  select coalesce(jsonb_agg(e), '[]'::jsonb) into answers
  from jsonb_array_elements(case when jsonb_typeof(l.form_answers) = 'array' then l.form_answers else '[]'::jsonb end) e
  where e->>'q' is distinct from q;
  update leads set form_answers = answers || jsonb_build_array(jsonb_build_object('q', q, 'a', v)) where id = l.id;

  insert into lead_events (lead_id, agent_id, event_type, to_value, source)
  values (l.id, l.agent_id, 'call_time_set', v, 'website');
  return true;
end;
$$;
revoke all on function public.set_call_time(text, text) from public;
grant execute on function public.set_call_time(text, text) to anon, authenticated;

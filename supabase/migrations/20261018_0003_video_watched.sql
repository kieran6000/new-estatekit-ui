-- The thank-you page's video, in the lead's history. Add-only.
--
-- When someone who just sent a form turns the video's sound on (the silent
-- start isn't counted), the page reports how far they've got (start, 25%,
-- 50%, 75%, all of it) with their private code. One history entry per lead
-- per day, updated as they get further: from_value holds the furthest %,
-- to_value says it in words.

alter table public.lead_events drop constraint if exists lead_events_event_type_check;
alter table public.lead_events add constraint lead_events_event_type_check check (
  event_type = any (array[
    'created', 'stage_changed', 'note_changed', 'archived', 'restored', 'pipeline_moved', 'call', 'whatsapp_sent',
    'email_sent', 'email_failed', 'email_delivered', 'email_delayed', 'email_bounced', 'email_complained',
    'email_opened', 'email_clicked', 'plan_opened', 'plan_pdf_opened', 'workflow_email', 'workflow_email_opened',
    'tagged', 'email_unsubscribed', 'capi_reported', 'call_time_set', 'resubmitted',
    'video_watched'
  ])
);

create or replace function public.log_video_watch(p_token text, p_percent int, p_seconds int)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_lead uuid;
  v_agent uuid;
  v_pct int := greatest(0, least(100, coalesce(p_percent, 0)));
  v_secs int := greatest(0, least(36000, coalesce(p_seconds, 0)));
  v_label text;
  e record;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{32}$' then return false; end if;
  v_lead := lead_for_plan_token(p_token);
  if v_lead is null then return false; end if;
  select agent_id into v_agent from leads where id = v_lead;

  v_label := case
    when v_pct >= 95 then 'Watched all of the thank-you video'
    when v_pct = 0 then 'Started the thank-you video'
    else 'Watched ' || v_pct || '% of the thank-you video'
  end || case when v_secs > 0 then ' (' || (v_secs / 60) || 'm ' || lpad((v_secs % 60)::text, 2, '0') || 's)' else '' end;

  select id, from_value into e from lead_events
   where lead_id = v_lead and event_type = 'video_watched' and created_at > now() - interval '1 day'
   order by created_at desc limit 1;
  if e.id is null then
    insert into lead_events (lead_id, agent_id, event_type, from_value, to_value, source)
    values (v_lead, v_agent, 'video_watched', v_pct::text, v_label, 'website');
  elsif v_pct > coalesce(nullif(e.from_value, '')::int, 0) then
    update lead_events set from_value = v_pct::text, to_value = v_label where id = e.id;
  end if;
  return true;
end;
$$;
revoke all on function public.log_video_watch(text, int, int) from public;
grant execute on function public.log_video_watch(text, int, int) to anon, authenticated;

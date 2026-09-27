-- Confirmation email + selling plan events go to the Discord activity log.
-- Add-only: one function + one AFTER INSERT trigger on lead_events.
--
-- Sent: sent, didn't send, bounced, marked as spam, first plan open, first
-- WhatsApp tap. Not sent: delivered / opened / delayed (too noisy; they
-- stay in the lead's history and the email stats card).

create or replace function public.lead_event_to_discord()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event text;
  v_name text;
begin
  v_event := case new.event_type
    when 'email_sent' then 'email_sent'
    when 'email_failed' then 'email_failed'
    when 'email_bounced' then 'email_bounced'
    when 'email_complained' then 'email_complained'
    when 'plan_opened' then 'plan_opened'
    when 'email_clicked' then 'email_whatsapp_tap'
  end;
  if v_event is null then
    return new;
  end if;

  -- A lead can tap the WhatsApp link many times: only the first is announced.
  if new.event_type = 'email_clicked' and exists (
    select 1 from lead_events
    where lead_id = new.lead_id and event_type = 'email_clicked' and id <> new.id
  ) then
    return new;
  end if;

  select name into v_name from leads where id = new.lead_id;

  perform net.http_post(
    url := 'https://yfcnsvrhojpysrzqrkdi.supabase.co/functions/v1/track-activity',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object(
      'event', v_event,
      'agentId', new.agent_id,
      'lead', jsonb_build_object('id', new.lead_id, 'name', v_name),
      'detail', new.to_value
    )
  );
  return new;
exception when others then
  -- Logging must never stop the history row from being saved.
  return new;
end;
$$;

drop trigger if exists lead_event_to_discord on public.lead_events;
create trigger lead_event_to_discord
  after insert on public.lead_events
  for each row execute function public.lead_event_to_discord();

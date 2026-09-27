-- 1) First email open goes to the Discord activity log too (opens now come
--    from our own pixel, the email-open function).
-- 2) get_sample_selling_plan(agent): the selling plan with the agent's real
--    details and a made-up seller, for the "See a sample plan" link on the
--    Forms page. Only the agent themselves or an operator can read it, and it
--    writes nothing to any lead's history.

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
    when 'email_opened' then 'email_opened'
    when 'plan_opened' then 'plan_opened'
    when 'email_clicked' then 'email_whatsapp_tap'
  end;
  if v_event is null then
    return new;
  end if;

  -- Opens and taps can happen many times: only the first is announced.
  if new.event_type in ('email_clicked', 'email_opened') and exists (
    select 1 from lead_events
    where lead_id = new.lead_id and event_type = new.event_type and id <> new.id
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

create or replace function public.get_sample_selling_plan(p_agent uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  a record;
  pg record;
  v_sales jsonb;
begin
  -- coalesce: with no login, auth.uid() is null and the check must say no.
  if p_agent is null or not (coalesce(p_agent = auth.uid(), false) or coalesce(is_operator(), false)) then
    return null;
  end if;

  select display_name, company, email, whatsapp_number, avatar_url into a
  from agent_profiles where agent_id = p_agent;
  if not found then return null; end if;

  -- Their newest lead page, for the accent colour and phone.
  select accent_color, slug, phone into pg
  from lead_pages where agent_id = p_agent order by created_at desc limit 1;

  select coalesce(jsonb_agg(jsonb_build_object('address', s.address, 'price', s.price, 'status', s.status, 'image_url', s.image_url) order by s.sort_order), '[]'::jsonb)
  into v_sales
  from (select * from sold_listings where agent_id = p_agent order by sort_order limit 6) s;

  return jsonb_build_object(
    'lead_id', '00000000-0000-0000-0000-000000000000',
    'lead_name', 'Thandi',
    'address', '14 Loop Street, Centurion',
    'reason', 'Downsizing',
    'timeline', '1 – 3 months',
    'date', to_char(now() at time zone 'Africa/Johannesburg', 'DD Mon YYYY'),
    'agent_name', coalesce(a.display_name, ''),
    'company', coalesce(a.company, ''),
    'agent_email', coalesce(a.email, ''),
    'agent_phone', coalesce(nullif(a.whatsapp_number, ''), pg.phone, ''),
    'photo', case when a.avatar_url ~ '^https://' then a.avatar_url else null end,
    'accent', coalesce(pg.accent_color, '#1976d2'),
    'page_slug', pg.slug,
    'sales', v_sales
  );
end;
$$;
revoke all on function public.get_sample_selling_plan(uuid) from public;
grant execute on function public.get_sample_selling_plan(uuid) to authenticated;

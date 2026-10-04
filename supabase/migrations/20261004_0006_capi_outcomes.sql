-- Tell Facebook what happened to a lead after the form: booked, signed,
-- commission received (and, for instant-form leads, that it arrived).
--
-- Why: "Lead" alone teaches Meta to find people who fill in forms. Sending
-- the later stages lets it learn which leads turn into business. Instant-form
-- leads go in Meta's CRM format ("conversion leads"), matched on Facebook's
-- own lead id; website leads as Schedule / MandateSigned / Purchase.
--
-- Only for leads whose form has a dataset (lead_pages.fb_pixel_id) with
-- backup tracking switched on (fb_capi_config.enabled) — nothing is sent for
-- anyone else. The sending, the checks and the once-only rule live in the
-- fb-capi-lead edge function; this only says when.

alter table public.lead_events drop constraint if exists lead_events_event_type_check;
alter table public.lead_events add constraint lead_events_event_type_check check (event_type = any (array[
  'created', 'stage_changed', 'note_changed', 'archived', 'restored', 'pipeline_moved', 'call', 'whatsapp_sent',
  'email_sent', 'email_failed', 'email_delivered', 'email_delayed', 'email_bounced', 'email_complained',
  'email_opened', 'email_clicked', 'plan_opened', 'plan_pdf_opened', 'workflow_email', 'workflow_email_opened',
  'tagged', 'email_unsubscribed', 'capi_reported'
]));

create or replace function public.report_lead_outcome()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_outcomes text[] := '{}';
  v_o text;
begin
  -- Is this lead's form reporting to Facebook at all?
  if new.source_page_id is null or not exists (
    select 1 from lead_pages lp
      join fb_capi_config c on c.pixel_id = regexp_replace(coalesce(lp.fb_pixel_id, ''), '\D', '', 'g')
     where lp.id = new.source_page_id and c.enabled
  ) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.fb_lead_id is not null then v_outcomes := v_outcomes || 'lead'::text; end if;
  else
    if new.stage is distinct from old.stage then
      if new.stage in ('Booked', 'Viewing Booked') then v_outcomes := v_outcomes || 'booked'::text; end if;
      -- Straight to signed counts as booked too (they met).
      if new.stage in ('Mandate Signed', 'Bought') then v_outcomes := v_outcomes || array['booked', 'signed']; end if;
    end if;
    if new.commission_received_at is not null and old.commission_received_at is null then
      v_outcomes := v_outcomes || 'won'::text;
    end if;
  end if;

  foreach v_o in array v_outcomes loop
    perform net.http_post(
      url := 'https://yfcnsvrhojpysrzqrkdi.supabase.co/functions/v1/fb-capi-lead',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := jsonb_build_object('leadId', new.id, 'outcome', v_o)
    );
  end loop;
  return new;
-- Reporting to Facebook must never stop a lead from saving.
exception when others then
  raise warning 'report_lead_outcome: %', sqlerrm;
  return new;
end;
$$;

revoke all on function public.report_lead_outcome() from public, anon, authenticated;

create or replace trigger leads_report_outcome
  after insert or update of stage, commission_received_at on public.leads
  for each row execute function public.report_lead_outcome();

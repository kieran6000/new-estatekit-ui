-- Tell Facebook what happens to EstateKit's OWN sales leads (the "agency"
-- pipeline fed by /pitch), the same way we already do for agents' seller /
-- buyer leads. Kieran asked to "map the key ones":
--
--   Call booked   -> booked    (Meta "Schedule")
--   Showed        -> attended  (Meta "Showed")
--   Signed        -> signed    (Meta "MandateSigned")
--   Paid          -> won       (Meta "Purchase")
--
-- Why: Meta only learns from what we tell it. Sending these later stages lets
-- EstateKit's own ad account learn which prospective agents actually sign and
-- pay, not just who books a call.
--
-- Add-only: this just replaces the report_lead_outcome() function body to add
-- the agency branch. Seller / buyer / general behaviour is unchanged. The
-- sending, the once-only rule and the "did this really happen" check live in
-- the fb-capi-lead edge function (which now understands the "attended"
-- outcome and agency stages).

create or replace function public.report_lead_outcome()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_outcomes text[] := '{}';
  v_o text;
  v_kind text;
begin
  -- Is this lead's form reporting to Facebook at all?
  if new.source_page_id is null or not exists (
    select 1 from lead_pages lp
      join fb_capi_config c on c.pixel_id = regexp_replace(coalesce(lp.fb_pixel_id, ''), '\D', '', 'g')
     where lp.id = new.source_page_id and c.enabled
  ) then
    return new;
  end if;

  select kind into v_kind from pipelines where id = new.pipeline_id;

  if tg_op = 'INSERT' then
    if new.fb_lead_id is not null then v_outcomes := v_outcomes || 'lead'::text; end if;

  elsif v_kind = 'agency' then
    -- EstateKit's own prospective-agent pipeline. Each stage backfills the
    -- earlier signals, so a lead that jumps ahead still reports them (the edge
    -- function dedups, so a repeat is a harmless no-op). "No-show" counts as
    -- booked (they did book) but never as attended.
    if new.stage is distinct from old.stage then
      if new.stage = 'Call booked' then v_outcomes := v_outcomes || 'booked'::text; end if;
      if new.stage = 'No-show'     then v_outcomes := v_outcomes || 'booked'::text; end if;
      if new.stage = 'Showed'        then v_outcomes := v_outcomes || array['booked', 'attended']; end if;
      if new.stage = 'Proposal sent' then v_outcomes := v_outcomes || array['booked', 'attended']; end if;
      if new.stage = 'Signed'        then v_outcomes := v_outcomes || array['booked', 'attended', 'signed']; end if;
      if new.stage = 'Paid'          then v_outcomes := v_outcomes || array['booked', 'attended', 'signed', 'won']; end if;
    end if;

  else
    -- Seller / buyer / general — unchanged.
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

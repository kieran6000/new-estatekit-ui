-- Self-run accounts (agent_profiles.builds_own_forms): an account another
-- agency runs gets EstateKit's admin tools for ITSELF only: its ads, its
-- tracking and its automations. Nothing here widens what any other account
-- can see.
--
-- 1. Close a hole: agents could update their own profile row freely, so one
--    request could set is_operator = true (staff, every account). Proven on
--    10 Nov 2026 in a rolled-back test. Only staff (or the server) may change
--    the fields that grant access or describe billing.

create or replace function public.guard_account_status()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if coalesce(auth.role(), '') = 'service_role' or coalesce(public.is_operator(), false) then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if coalesce(new.is_operator, false) or coalesce(new.builds_own_forms, false) or new.team_lead_id is not null then
      raise exception 'Only EstateKit staff can set up access';
    end if;
    return new;
  end if;
  if new.deactivated_at is distinct from old.deactivated_at
     or new.deactivated_reason is distinct from old.deactivated_reason
     or new.deactivated_by_name is distinct from old.deactivated_by_name
     or new.automations_paused_before_deactivation is distinct from old.automations_paused_before_deactivation then
    raise exception 'Only EstateKit staff can change an account''s status';
  end if;
  if new.is_operator is distinct from old.is_operator
     or new.builds_own_forms is distinct from old.builds_own_forms
     or new.team_lead_id is distinct from old.team_lead_id
     or new.tier is distinct from old.tier
     or new.fb_ad_account_id is distinct from old.fb_ad_account_id
     or new.fb_page_id is distinct from old.fb_page_id
     or new.renewal_date is distinct from old.renewal_date
     or new.contract_pdf_url is distinct from old.contract_pdf_url
     or new.adspend_balance is distinct from old.adspend_balance
     or new.billing_type is distinct from old.billing_type
     or new.plan_pdf_url is distinct from old.plan_pdf_url
     or new.plan_pdf_name is distinct from old.plan_pdf_name then
    raise exception 'Only EstateKit staff can change this';
  end if;
  return new;
end $function$;

drop trigger if exists guard_account_insert on public.agent_profiles;
create trigger guard_account_insert before insert on public.agent_profiles
  for each row execute function public.guard_account_status();

-- 2. Is the signed-in account one that runs itself?
create or replace function public.runs_own_account()
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select coalesce((select builds_own_forms from agent_profiles where agent_id = auth.uid()), false);
$$;
revoke all on function public.runs_own_account() from public, anon;
grant execute on function public.runs_own_account() to authenticated;

-- 3. The client list: staff see everyone; anyone sees their own row (their
--    Overview's lead counts). Security invoker, so row rules still apply.
create or replace function public.client_directory()
returns table (
  agent_id uuid,
  leads_total bigint,
  leads_30d bigint,
  leads_7d bigint,
  last_lead_at timestamptz,
  lead_pages bigint,
  pipelines bigint,
  by_stage jsonb
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    p.agent_id,
    (select count(*) from leads l where l.agent_id = p.agent_id and not l.archived),
    (select count(*) from leads l where l.agent_id = p.agent_id and not l.archived and l.created_at > now() - interval '30 days'),
    (select count(*) from leads l where l.agent_id = p.agent_id and not l.archived and l.created_at > now() - interval '7 days'),
    (select max(l.created_at) from leads l where l.agent_id = p.agent_id),
    (select count(*) from lead_pages lp where lp.agent_id = p.agent_id),
    (select count(*) from pipelines pl where pl.agent_id = p.agent_id),
    coalesce((select jsonb_object_agg(s.stage, s.n) from (
      select l.stage, count(*) n from leads l where l.agent_id = p.agent_id and not l.archived group by l.stage
    ) s), '{}'::jsonb)
  from agent_profiles p
  where is_operator() or p.agent_id = auth.uid();
$$;
revoke all on function public.client_directory() from public, anon;
grant execute on function public.client_directory() to authenticated;

-- 4. Automations: their own workflows, runs and history. Templates can be read
--    (to start from) but never changed.
create policy "Self-run accounts manage own workflows" on public.workflows for all to authenticated
  using (agent_id = auth.uid() and not is_template and public.runs_own_account())
  with check (agent_id = auth.uid() and not is_template and public.runs_own_account());
create policy "Self-run accounts read templates" on public.workflows for select to authenticated
  using (is_template and public.runs_own_account());
create policy "Self-run accounts manage own workflow runs" on public.workflow_runs for all to authenticated
  using (agent_id = auth.uid() and public.runs_own_account())
  with check (agent_id = auth.uid() and public.runs_own_account());
create policy "Self-run accounts read own workflow log" on public.workflow_log for select to authenticated
  using (agent_id = auth.uid() and public.runs_own_account());
create policy "Self-run accounts read own workflow emails" on public.workflow_emails for select to authenticated
  using (agent_id = auth.uid() and public.runs_own_account());

-- "Add the standard workflows" for their own account too.
create or replace function public.add_standard_workflows(p_agent uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_n int;
begin
  -- Staff, the database itself (new accounts, migrations), or a self-run
  -- account adding them to itself.
  if auth.uid() is not null and not coalesce(is_operator(), false)
     and not (p_agent = auth.uid() and coalesce(runs_own_account(), false)) then
    raise exception 'staff only';
  end if;
  insert into workflows (agent_id, name, published, definition, from_template)
  select p_agent, t.name, t.standard_on, t.definition, t.id
    from workflows t
   where t.is_template and t.standard
     and not exists (select 1 from workflows w where w.agent_id = p_agent and w.from_template = t.id)
   order by t.created_at;
  get diagnostics v_n = row_count;
  return v_n;
end;
$function$;

-- 5. Tracking: the Conversions API settings for a pixel only their own pages
--    use (never one another account's page uses too), what it sent for their
--    leads, and their pages' visit funnel.
create policy "Self-run accounts manage own capi config" on public.fb_capi_config for all to authenticated
  using (
    public.runs_own_account()
    and exists (select 1 from lead_pages lp where lp.fb_pixel_id = fb_capi_config.pixel_id and lp.agent_id = auth.uid())
    and not exists (select 1 from lead_pages o where o.fb_pixel_id = fb_capi_config.pixel_id and o.agent_id <> auth.uid())
  )
  with check (
    public.runs_own_account()
    and exists (select 1 from lead_pages lp where lp.fb_pixel_id = fb_capi_config.pixel_id and lp.agent_id = auth.uid())
    and not exists (select 1 from lead_pages o where o.fb_pixel_id = fb_capi_config.pixel_id and o.agent_id <> auth.uid())
  );
create policy "Self-run accounts read own capi events" on public.fb_capi_events for select to authenticated
  using (public.runs_own_account() and exists (select 1 from leads l where l.id = fb_capi_events.lead_id and l.agent_id = auth.uid()));
create policy "Self-run accounts read own page funnel" on public.lead_page_events for select to authenticated
  using (agent_id = auth.uid() and public.runs_own_account());

-- The access token never goes to a browser (the server uses its own key):
-- browsers may read every column but that one.
revoke select on public.fb_capi_config from authenticated, anon;
grant select (pixel_id, enabled, test_event_code, label, created_at, updated_at) on public.fb_capi_config to authenticated;

-- Every account on workflows; the old shared automations retired.
--
-- 1. Today's 8 shared automations become the "standard" templates, converted
--    exactly as the builder's fromAutomation does (src/lib/workflow.ts),
--    with re-entry on for stage automations (the old engine ran them again
--    each time a lead came back to the stage).
-- 2. Every account gets its own copy of the standard templates, switched on
--    or off as the automation was, and uses_workflows is set.
-- 3. Runs the old engine had queued carry on as workflow runs at the same
--    step and the same time; the old runs are cancelled.
-- 4. New accounts get the standard templates automatically.

alter table public.workflows
  add column if not exists standard boolean not null default false,
  add column if not exists standard_on boolean not null default false;
alter table public.agent_profiles alter column uses_workflows set default true;

-- 1. Standard templates (once).
do $$
declare
  a record;
  s record;
  v_steps jsonb;
  v_trigger jsonb;
  v_amount int;
  v_unit text;
begin
  if exists (select 1 from public.workflows where is_template and standard) then return; end if;
  for a in select * from public.automations order by created_at loop
    v_steps := '[]'::jsonb;
    for s in select * from public.automation_steps where automation_id = a.id order by step_order loop
      if s.delay_minutes > 0 and a.trigger_type <> 'daily_digest' then
        if s.delay_minutes % 1440 = 0 then v_amount := s.delay_minutes / 1440; v_unit := 'days';
        elsif s.delay_minutes % 60 = 0 then v_amount := s.delay_minutes / 60; v_unit := 'hours';
        else v_amount := s.delay_minutes; v_unit := 'minutes';
        end if;
        v_steps := v_steps || jsonb_build_array(jsonb_build_object('id', 'w' || substr(md5(random()::text), 1, 10), 'type', 'wait', 'amount', v_amount, 'unit', v_unit));
      end if;
      if s.action_type = 'send_whatsapp' then
        v_steps := v_steps || jsonb_build_array(jsonb_build_object('id', 'm' || substr(md5(random()::text), 1, 10), 'type', 'whatsapp_agent', 'text', coalesce(s.template_text, '')));
      elsif s.action_type = 'set_stage' then
        v_steps := v_steps || jsonb_build_array(jsonb_build_object('id', 'g' || substr(md5(random()::text), 1, 10), 'type', 'set_stage', 'stage', coalesce(s.payload->>'stage', '')));
      elsif s.action_type = 'set_reminder' then
        v_steps := v_steps || jsonb_build_array(jsonb_build_object('id', 'r' || substr(md5(random()::text), 1, 10), 'type', 'reminder',
          'label', coalesce(s.payload->>'label', 'Follow up'), 'inDays', round(coalesce((s.payload->>'offset_minutes')::numeric, 0) / 1440)));
      end if;
    end loop;
    v_trigger := case a.trigger_type
      when 'stage_changed' then jsonb_build_object('kind', 'stage_changed', 'stage', a.trigger_stage)
      when 'daily_digest' then '{"kind":"daily_at","time":"16:00"}'::jsonb
      else '{"kind":"lead_created"}'::jsonb
    end;
    insert into public.workflows (agent_id, is_template, name, published, definition, standard, standard_on)
    values (null, true, replace(a.name, 'â€”', '—'), false, jsonb_build_object(
      'trigger', v_trigger,
      'filters', '[]'::jsonb,
      'steps', v_steps,
      'exits', '[{"kind":"booked","on":false},{"kind":"lost","on":false},{"kind":"any_stage_change","on":false}]'::jsonb,
      'settings', jsonb_build_object('quietHours', a.trigger_type <> 'lead_created', 'reEnter', a.trigger_type = 'stage_changed')
    ), true, a.enabled);
  end loop;
end $$;

-- 2. Copies for an account: what new accounts get, and the "Add the
--    standard workflows" button on an empty account.
create or replace function public.add_standard_workflows(p_agent uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  -- Staff, or the database itself (new accounts, migrations).
  if auth.uid() is not null and not coalesce(is_operator(), false) then
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
$$;
revoke all on function public.add_standard_workflows(uuid) from public, anon;
grant execute on function public.add_standard_workflows(uuid) to authenticated;

create or replace function public.new_account_workflows()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform add_standard_workflows(new.agent_id);
  return new;
exception when others then
  -- Never stop an account being created.
  raise warning 'new_account_workflows: %', sqlerrm;
  return new;
end;
$$;
drop trigger if exists agent_profiles_new_account_workflows on public.agent_profiles;
create trigger agent_profiles_new_account_workflows after insert on public.agent_profiles
  for each row execute function public.new_account_workflows();

-- 3. Every account: its copy of the standard set, and workflows only. What the
--    old engine had queued carries on at the same step and time (Contacted:
--    step 0 → [1], step 1 → [3]; Booked's "did they sign?" for a past
--    appointment → "Booked — did they sign?" [0]), then the old runs stop.
--    Run once on 4 Oct 2026, after 20261004_0004 (appointment workflows).
do $$
declare
  p record;
  r record;
  v_wf uuid;
  v_pos jsonb;
  v_key text;
begin
  if not exists (select 1 from public.workflows where is_template and standard and trigger_kind = 'appointment') then return; end if;
  for p in select agent_id from public.agent_profiles loop
    perform public.add_standard_workflows(p.agent_id);
  end loop;
  update public.agent_profiles set uses_workflows = true where not uses_workflows;
  for r in
    select ar.*, a.name aname, l.agent_id, l.stage, l.appointment_at
      from public.automation_runs ar join public.automations a on a.id = ar.automation_id join public.leads l on l.id = ar.lead_id
     where ar.status in ('pending', 'paused')
  loop
    v_wf := null;
    if r.aname like 'Contacted%' then
      select w.id into v_wf from public.workflows w join public.workflows t on t.id = w.from_template
       where w.agent_id = r.agent_id and t.name = 'Contacted — follow-up sequence';
      v_pos := case r.current_step when 0 then '[1]' else '[3]' end::jsonb;
      v_key := 'legacy-' || r.id;
    elsif r.aname like 'Booked%' and r.current_step = 1 and (r.appointment_at is null or r.appointment_at < now()) then
      select w.id into v_wf from public.workflows w join public.workflows t on t.id = w.from_template
       where w.agent_id = r.agent_id and t.name = 'Booked — did they sign?';
      v_pos := '[0]'::jsonb;
      v_key := case when r.appointment_at is null then 'legacy-' || r.id else 'appt-' || extract(epoch from r.appointment_at)::bigint end;
    end if;
    if v_wf is not null then
      insert into public.workflow_runs (workflow_id, agent_id, lead_id, status, run_at, pos, started, trigger_key, start_stage)
      values (v_wf, r.agent_id, r.lead_id, r.status, r.run_at, v_pos, true, v_key, r.stage)
      on conflict do nothing;
    end if;
  end loop;
  update public.automation_runs set status = 'cancelled' where status in ('pending', 'paused', 'processing');
end $$;

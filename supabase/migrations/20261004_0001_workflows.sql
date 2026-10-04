-- Workflows: the builder's workflows, saved and run for real.
--
-- workflows        one per account (agent_id), or a template in the shared
--                  library (is_template, no account). `definition` is the
--                  builder's model (src/lib/workflow.ts): trigger, filters,
--                  steps, exits, settings.
-- workflow_runs    one lead (or one agent, for a daily summary) going through
--                  a workflow. `pos` is where it is in the step tree:
--                  [3] = 4th main step, [3,"yes",0] = 1st step on the Yes path
--                  of the 4th. run-automations walks them every minute.
-- workflow_log     what each run did, for the workflow's History tab.
-- workflow_emails  each email a workflow sent, so "Opened the last email"
--                  can be checked (the /oe/<id> open pixel sets opened_at).
--
-- Cut-over is per account: agent_profiles.uses_workflows switches the old
-- shared automations (and the daily digest) off for that account only, so
-- one account can be checked side by side before the next.
--
-- Leads get stored tags (the "Add tag" step) and an email opt-out (the
-- unsubscribe link in workflow emails).

-- ── Columns ────────────────────────────────────────────────────────────────
alter table public.leads add column if not exists tags text[] not null default '{}';
alter table public.leads add column if not exists email_opt_out boolean not null default false;
alter table public.agent_profiles add column if not exists uses_workflows boolean not null default false;

-- History rows workflows write.
alter table public.lead_events drop constraint if exists lead_events_event_type_check;
alter table public.lead_events add constraint lead_events_event_type_check check (event_type = any (array[
  'created', 'stage_changed', 'note_changed', 'archived', 'restored', 'pipeline_moved', 'call', 'whatsapp_sent',
  'email_sent', 'email_failed', 'email_delivered', 'email_delayed', 'email_bounced', 'email_complained',
  'email_opened', 'email_clicked', 'plan_opened', 'plan_pdf_opened',
  'workflow_email', 'workflow_email_opened', 'tagged', 'email_unsubscribed'
]));

-- ── Tables ─────────────────────────────────────────────────────────────────
create table if not exists public.workflows (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references auth.users(id) on delete cascade,
  is_template boolean not null default false,
  name text not null,
  published boolean not null default false,
  definition jsonb not null,
  trigger_kind text generated always as (definition->'trigger'->>'kind') stored,
  from_template uuid references public.workflows(id) on delete set null,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workflows_owner check ((is_template and agent_id is null) or (not is_template and agent_id is not null))
);
create index if not exists workflows_agent_trigger on public.workflows (agent_id, trigger_kind) where published;

create table if not exists public.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  agent_id uuid not null,
  lead_id uuid references public.leads(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'paused', 'completed', 'stopped', 'cancelled', 'failed')),
  run_at timestamptz not null default now(),
  pos jsonb not null default '[0]'::jsonb,
  started boolean not null default false,
  trigger_key text not null default '',
  start_stage text,
  last_email_id uuid,
  stop_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists workflow_runs_once
  on public.workflow_runs (workflow_id, coalesce(lead_id, '00000000-0000-0000-0000-000000000000'::uuid), trigger_key);
create index if not exists workflow_runs_due on public.workflow_runs (run_at) where status = 'pending';
create index if not exists workflow_runs_lead on public.workflow_runs (lead_id);

create table if not exists public.workflow_log (
  id bigserial primary key,
  run_id uuid references public.workflow_runs(id) on delete cascade,
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  agent_id uuid,
  lead_id uuid references public.leads(id) on delete cascade,
  step_id text,
  what text not null,
  status text not null,
  detail text,
  at timestamptz not null default now()
);
create index if not exists workflow_log_workflow on public.workflow_log (workflow_id, at desc);

create table if not exists public.workflow_emails (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.workflow_runs(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  agent_id uuid,
  subject text,
  sent_at timestamptz not null default now(),
  opened_at timestamptz
);

-- ── Who can see what: staff only (the service role runs them) ──────────────
alter table public.workflows enable row level security;
alter table public.workflow_runs enable row level security;
alter table public.workflow_log enable row level security;
alter table public.workflow_emails enable row level security;

drop policy if exists "Staff manage workflows" on public.workflows;
create policy "Staff manage workflows" on public.workflows for all to authenticated
  using (public.is_operator()) with check (public.is_operator());
drop policy if exists "Staff manage workflow runs" on public.workflow_runs;
create policy "Staff manage workflow runs" on public.workflow_runs for all to authenticated
  using (public.is_operator()) with check (public.is_operator());
drop policy if exists "Staff read workflow log" on public.workflow_log;
create policy "Staff read workflow log" on public.workflow_log for select to authenticated
  using (public.is_operator());
drop policy if exists "Staff read workflow emails" on public.workflow_emails;
create policy "Staff read workflow emails" on public.workflow_emails for select to authenticated
  using (public.is_operator());

-- ── Enrolling leads ────────────────────────────────────────────────────────
-- re-enter off: trigger_key '' (unique), so a lead goes through once.
-- re-enter on: a fresh key each time, but never while a run is still going.
create or replace function public.enroll_workflow(p_wf public.workflows, p_lead public.leads, p_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reenter boolean := coalesce((p_wf.definition->'settings'->>'reEnter')::boolean, false);
begin
  if v_reenter and exists (
    select 1 from workflow_runs where workflow_id = p_wf.id and lead_id = p_lead.id and status in ('pending', 'processing', 'paused')
  ) then
    return;
  end if;
  insert into workflow_runs (workflow_id, agent_id, lead_id, run_at, trigger_key, start_stage)
  values (p_wf.id, p_lead.agent_id, p_lead.id, now(), case when v_reenter then coalesce(nullif(p_key, ''), now()::text) else '' end, p_lead.stage)
  on conflict do nothing;
end;
$$;

create or replace function public.enqueue_workflows()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  wf public.workflows;
  v_misses int;
  v_booked text[] := array['Booked', 'Viewing Booked', 'Offer Made', 'Mandate Signed', 'Bought'];
  v_lost text[] := array['Lost', 'Invalid Number'];
begin
  if tg_op = 'INSERT' then
    if new.created_at >= now() - interval '30 minutes' and not new.archived then
      for wf in select * from workflows where agent_id = new.agent_id and published and trigger_kind = 'lead_created' loop
        perform enroll_workflow(wf, new, '');
      end loop;
    end if;
    return new;
  end if;

  if old.stage is distinct from new.stage then
    -- Stop early: runs waiting on this lead whose stop rules match the new stage.
    update workflow_runs r
       set status = 'stopped', stop_reason = 'Lead moved to ' || new.stage, updated_at = now()
      from workflows w
     where r.lead_id = new.id and r.workflow_id = w.id and r.status in ('pending', 'paused')
       and (
         (new.stage = any (v_booked) and exists (select 1 from jsonb_array_elements(w.definition->'exits') e where e->>'kind' = 'booked' and (e->>'on')::boolean))
         or (new.stage = any (v_lost) and exists (select 1 from jsonb_array_elements(w.definition->'exits') e where e->>'kind' = 'lost' and (e->>'on')::boolean))
         or (new.stage is distinct from r.start_stage and exists (select 1 from jsonb_array_elements(w.definition->'exits') e where e->>'kind' = 'any_stage_change' and (e->>'on')::boolean))
       );

    if not new.archived then
      for wf in
        select * from workflows
         where agent_id = new.agent_id and published and trigger_kind = 'stage_changed'
           and definition->'trigger'->>'stage' = new.stage
      loop
        perform enroll_workflow(wf, new, '');
      end loop;

      if new.stage = 'No Answer' then
        -- This change's own history row isn't written yet (it's the next trigger).
        select count(*) + 1 into v_misses from lead_events
         where lead_id = new.id and event_type = 'stage_changed' and to_value = 'No Answer';
        for wf in
          select * from workflows
           where agent_id = new.agent_id and published and trigger_kind = 'no_answer_times'
             and (definition->'trigger'->>'count')::int = v_misses
        loop
          perform enroll_workflow(wf, new, 'misses-' || v_misses);
        end loop;
      end if;
    end if;
  end if;
  return new;
exception when others then
  -- A workflow problem must never stop a lead from being saved.
  raise warning 'enqueue_workflows: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists leads_enqueue_workflows on public.leads;
create trigger leads_enqueue_workflows after insert or update on public.leads
  for each row execute function public.enqueue_workflows();

-- "Lead opens their Marketing Plan".
create or replace function public.enqueue_workflows_on_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  wf public.workflows;
  l public.leads;
begin
  if new.event_type <> 'plan_opened' then return new; end if;
  select * into l from leads where id = new.lead_id;
  if l.id is null or l.archived then return new; end if;
  for wf in select * from workflows where agent_id = l.agent_id and published and trigger_kind = 'plan_opened' loop
    perform enroll_workflow(wf, l, 'plan-' || coalesce(new.from_value, 'email'));
  end loop;
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists lead_events_enqueue_workflows on public.lead_events;
create trigger lead_events_enqueue_workflows after insert on public.lead_events
  for each row execute function public.enqueue_workflows_on_event();

-- Triggers that come from the clock: reminders coming due, leads gone quiet,
-- and the weekday summary. run-automations calls this every minute.
create or replace function public.enqueue_scheduled_workflows()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  wf public.workflows;
  l public.leads;
  v_n int := 0;
  v_sast timestamp := now() at time zone 'Africa/Johannesburg';
  v_time time;
  rec record;
  v_settled text[] := array['Lost', 'Invalid Number', 'Booked', 'Mandate Signed', 'Viewing Booked', 'Offer Made', 'Bought'];
begin
  -- A run left half-done by a runner that crashed or timed out goes again.
  update workflow_runs set status = 'pending', updated_at = now()
   where status = 'processing' and updated_at < now() - interval '10 minutes';

  -- A reminder's time arrives (within the last day, so switching a workflow
  -- on doesn't fire for every old reminder).
  for wf in select * from workflows where published and not is_template and trigger_kind = 'reminder_due' loop
    for l in
      select * from leads
       where agent_id = wf.agent_id and not archived and reminder_at is not null
         and reminder_at <= now() and reminder_at > now() - interval '1 day'
         and reminder_at > wf.updated_at - interval '1 minute'
    loop
      perform enroll_workflow(wf, l, 'reminder-' || l.reminder_at::text);
      v_n := v_n + 1;
    end loop;
  end loop;

  -- Lead goes quiet: no call or stage change (and not created) in N days.
  -- Keyed on the last activity, so it fires once per quiet stretch (or once
  -- ever, when re-enter is off). Leads already handled for their current
  -- stretch are skipped in the query, so this stays cheap every minute.
  for wf in select * from workflows where published and not is_template and trigger_kind = 'not_contacted_for' loop
    for rec in
      select ld.id, a.last_at from leads ld
       cross join lateral (
         select greatest(ld.created_at, coalesce(max(e.created_at), ld.created_at)) as last_at
           from lead_events e where e.lead_id = ld.id and e.event_type in ('call', 'stage_changed')
       ) a
       where ld.agent_id = wf.agent_id and not ld.archived and not (ld.stage = any (v_settled))
         and a.last_at < now() - make_interval(days => greatest(1, coalesce((wf.definition->'trigger'->>'days')::int, 14)))
         and not exists (
           select 1 from workflow_runs r where r.workflow_id = wf.id and r.lead_id = ld.id
              and (r.created_at >= a.last_at or not coalesce((wf.definition->'settings'->>'reEnter')::boolean, false))
         )
       limit 200
    loop
      select * into l from leads where id = rec.id;
      perform enroll_workflow(wf, l, 'quiet-' || rec.last_at::text);
      v_n := v_n + 1;
    end loop;
  end loop;

  -- Weekday summary: once per agent per day, from the set time until 2 hours after.
  if extract(isodow from v_sast) between 1 and 5 then
    for wf in select * from workflows where published and not is_template and trigger_kind = 'daily_at' loop
      begin
        v_time := (wf.definition->'trigger'->>'time')::time;
      exception when others then
        continue;
      end;
      if v_sast::time >= v_time and v_sast::time < v_time + interval '2 hours' then
        insert into workflow_runs (workflow_id, agent_id, lead_id, run_at, trigger_key)
        values (wf.id, wf.agent_id, null, now(), 'day-' || v_sast::date::text)
        on conflict do nothing;
      end if;
    end loop;
  end if;
  return v_n;
end;
$$;
revoke all on function public.enqueue_scheduled_workflows() from public, anon, authenticated;
revoke all on function public.enroll_workflow(public.workflows, public.leads, text) from public, anon, authenticated;

-- ── The old shared automations skip accounts that use workflows ────────────
create or replace function public.enqueue_automations()
returns trigger
language plpgsql
security definer
as $function$
declare
  auto record;
  step record;
begin
  -- Accounts switched to workflows don't get the old shared automations.
  if exists (select 1 from public.agent_profiles where agent_id = new.agent_id and uses_workflows) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.created_at >= now() - interval '30 minutes' then
      for auto in
        select id from public.automations
        where trigger_type = 'lead_created' and enabled = true
      loop
        select delay_minutes into step from public.automation_steps
          where automation_id = auto.id and step_order = 0 limit 1;
        insert into public.automation_runs (lead_id, automation_id, current_step, run_at, status)
        values (new.id, auto.id, 0,
          now() + coalesce(step.delay_minutes, 0) * interval '1 minute',
          'pending')
        on conflict (lead_id, automation_id)
          where status = any (array['pending','processing'])
          do nothing;
      end loop;
    end if;
  end if;

  if tg_op = 'UPDATE' and old.stage is distinct from new.stage then
    for auto in
      select id from public.automations
      where trigger_type = 'stage_changed'
        and enabled = true
        and (trigger_stage is null or trigger_stage = new.stage)
    loop
      select delay_minutes into step from public.automation_steps
        where automation_id = auto.id and step_order = 0 limit 1;
      insert into public.automation_runs (lead_id, automation_id, current_step, run_at, status)
      values (new.id, auto.id, 0,
        now() + coalesce(step.delay_minutes, 0) * interval '1 minute',
        'pending')
      on conflict (lead_id, automation_id)
        where status = any (array['pending','processing'])
        do nothing;
    end loop;
  end if;

  return new;
end;
$function$;

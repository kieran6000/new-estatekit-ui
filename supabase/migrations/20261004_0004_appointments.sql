-- Appointment times, and workflows that run a set time before or after them
-- ("1 hour before the appointment", "2 hours after the viewing").
--
-- leads.appointment_at is the time of the lead's Booked / Viewing Booked
-- appointment. The app has always stored that time in reminder_at (the
-- diary reads it there), so a trigger keeps appointment_at in step:
--   * moving into Booked / Viewing Booked with a time sets it,
--   * a new time while still booked moves it (a workflow "Set reminder" step
--     sets due = true and never moves it),
--   * leaving the booked stages clears it.
-- When it moves or clears, runs waiting on the old time stop; the scheduler
-- starts fresh ones for the new time.

alter table public.leads add column if not exists appointment_at timestamptz;

create or replace function public.track_appointment()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.stage in ('Booked', 'Viewing Booked') then
    if tg_op = 'INSERT' then
      new.appointment_at := case when coalesce(new.next_label, '') ilike 'appt%' then new.reminder_at end;
    elsif old.stage is distinct from new.stage then
      -- A booking writes its time with the stage. A plain stage move (a
      -- workflow step, a drag on the board) keeps an old follow-up time,
      -- which isn't an appointment.
      new.appointment_at := case
        when new.reminder_at is distinct from old.reminder_at or coalesce(new.next_label, '') ilike 'appt%' then new.reminder_at
      end;
    elsif new.reminder_at is distinct from old.reminder_at and not coalesce(new.due, false) then
      new.appointment_at := new.reminder_at;
    end if;
  else
    new.appointment_at := null;
  end if;
  return new;
exception when others then
  raise warning 'track_appointment: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists leads_track_appointment on public.leads;
create trigger leads_track_appointment before insert or update on public.leads
  for each row execute function public.track_appointment();

-- Existing bookings.
update public.leads set appointment_at = reminder_at
 where stage in ('Booked', 'Viewing Booked') and reminder_at is not null and appointment_at is null;

-- Appointment workflows go once per appointment (a moved appointment is a
-- new one), whatever "re-enter" says.
create or replace function public.enroll_workflow(p_wf public.workflows, p_lead public.leads, p_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reenter boolean := coalesce((p_wf.definition->'settings'->>'reEnter')::boolean, false);
  v_keyed boolean := v_reenter or p_wf.trigger_kind = 'appointment';
begin
  if v_reenter and exists (
    select 1 from workflow_runs where workflow_id = p_wf.id and lead_id = p_lead.id and status in ('pending', 'processing', 'paused')
  ) then
    return;
  end if;
  insert into workflow_runs (workflow_id, agent_id, lead_id, run_at, trigger_key, start_stage)
  values (p_wf.id, p_lead.agent_id, p_lead.id, now(), case when v_keyed then coalesce(nullif(p_key, ''), now()::text) else '' end, p_lead.stage)
  on conflict do nothing;
end;
$$;
revoke all on function public.enroll_workflow(public.workflows, public.leads, text) from public, anon, authenticated;

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

  -- The appointment moved or was cancelled: what was waiting on the old time stops.
  if old.appointment_at is distinct from new.appointment_at and old.appointment_at is not null then
    update workflow_runs r
       set status = 'stopped', updated_at = now(),
           stop_reason = case when new.appointment_at is null then 'The appointment was cancelled' else 'The appointment moved' end
      from workflows w
     where r.lead_id = new.id and r.workflow_id = w.id and r.status in ('pending', 'paused')
       and w.trigger_kind = 'appointment';
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

-- The clock: reminders coming due, leads gone quiet, appointments coming up
-- (or just past), and the weekday summary. run-automations calls this every
-- minute.
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
  v_off interval;
  v_after boolean;
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

  -- Before or after an appointment. Fires within an hour of its moment, so an
  -- appointment booked at short notice skips "1 day before" rather than
  -- sending it late, and a "before" never goes once the appointment has
  -- started. Keyed on the appointment's time: once per appointment.
  for wf in select * from workflows where published and not is_template and trigger_kind = 'appointment' loop
    begin
      v_off := make_interval(mins => greatest(1, coalesce((wf.definition->'trigger'->>'amount')::int, 1))
        * case wf.definition->'trigger'->>'unit' when 'days' then 1440 when 'hours' then 60 else 1 end);
      v_after := coalesce(wf.definition->'trigger'->>'when', 'before') = 'after';
    exception when others then
      continue;
    end;
    for l in
      select * from leads ld
       where ld.agent_id = wf.agent_id and not ld.archived and ld.appointment_at is not null
         and ld.stage in ('Booked', 'Viewing Booked')
         and (case when v_after then ld.appointment_at + v_off else ld.appointment_at - v_off end) <= now()
         and (case when v_after then ld.appointment_at + v_off else ld.appointment_at - v_off end) > now() - interval '1 hour'
         and (v_after or ld.appointment_at > now())
         and not exists (
           select 1 from workflow_runs r where r.workflow_id = wf.id and r.lead_id = ld.id
              and r.trigger_key = 'appt-' || extract(epoch from ld.appointment_at)::bigint
         )
       limit 200
    loop
      perform enroll_workflow(wf, l, 'appt-' || extract(epoch from l.appointment_at)::bigint);
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

-- The standard Booked / Viewing Booked workflows count from the appointment,
-- not from when it was booked ("wait 1 day" after booking was wrong for
-- nearly every appointment): a day-before reminder, an hour-before heads-up,
-- and "did they sign?" the day after. Viewing ones stay off, as before.
update public.workflows set name = 'Booked — day-before reminder', updated_at = now(), definition = jsonb_build_object(
  'trigger', '{"kind":"appointment","amount":1,"unit":"days","when":"before"}'::jsonb,
  'filters', '[{"field":"stage","value":"Booked"}]'::jsonb,
  'steps', jsonb_build_array(jsonb_build_object('id','mbk1day','type','whatsapp_agent','text', E'Appointment with {{first_name}} tomorrow, {{appointment}}. Confirm the details with them. {{action_link}}')),
  'exits', '[{"kind":"booked","on":false},{"kind":"lost","on":true},{"kind":"any_stage_change","on":false}]'::jsonb,
  'settings', '{"quietHours":false,"reEnter":false}'::jsonb)
 where is_template and standard and name = 'Booked — appt reminder + did-they-sign nudge';
update public.workflows set name = 'Viewing Booked — day-before reminder', updated_at = now(), definition = jsonb_build_object(
  'trigger', '{"kind":"appointment","amount":1,"unit":"days","when":"before"}'::jsonb,
  'filters', '[{"field":"stage","value":"Viewing Booked"}]'::jsonb,
  'steps', jsonb_build_array(jsonb_build_object('id','mvw1day','type','whatsapp_agent','text', E'Viewing with {{first_name}} tomorrow, {{appointment}}. Confirm the time with them. {{action_link}}')),
  'exits', '[{"kind":"booked","on":false},{"kind":"lost","on":true},{"kind":"any_stage_change","on":false}]'::jsonb,
  'settings', '{"quietHours":false,"reEnter":false}'::jsonb)
 where is_template and standard and name = 'Viewing Booked — prep reminder';
insert into public.workflows (agent_id, is_template, name, published, standard, standard_on, definition)
select null, true, v.name, false, true, v.on_, v.def from (values
  ('Booked — 1 hour before', true, jsonb_build_object(
    'trigger', '{"kind":"appointment","amount":1,"unit":"hours","when":"before"}'::jsonb,
    'filters', '[{"field":"stage","value":"Booked"}]'::jsonb,
    'steps', jsonb_build_array(jsonb_build_object('id','mbk1h','type','whatsapp_agent','text', E'In 1 hour: {{name}}, {{appointment}}.\n{{address}}\n{{phone}}')),
    'exits', '[{"kind":"booked","on":false},{"kind":"lost","on":true},{"kind":"any_stage_change","on":false}]'::jsonb,
    'settings', '{"quietHours":false,"reEnter":false}'::jsonb)),
  ('Booked — did they sign?', true, jsonb_build_object(
    'trigger', '{"kind":"appointment","amount":1,"unit":"days","when":"after"}'::jsonb,
    'filters', '[{"field":"stage","value":"Booked"}]'::jsonb,
    'steps', jsonb_build_array(jsonb_build_object('id','mbksign','type','whatsapp_agent','text', 'Did {{first_name}} sign? Update their stage: {{action_link}}')),
    'exits', '[{"kind":"booked","on":true},{"kind":"lost","on":true},{"kind":"any_stage_change","on":false}]'::jsonb,
    'settings', '{"quietHours":true,"reEnter":false}'::jsonb)),
  ('Viewing Booked — how did it go?', false, jsonb_build_object(
    'trigger', '{"kind":"appointment","amount":2,"unit":"hours","when":"after"}'::jsonb,
    'filters', '[{"field":"stage","value":"Viewing Booked"}]'::jsonb,
    'steps', jsonb_build_array(jsonb_build_object('id','mvwhow','type','whatsapp_agent','text', 'How did the viewing with {{first_name}} go? Update: {{action_link}}')),
    'exits', '[{"kind":"booked","on":true},{"kind":"lost","on":true},{"kind":"any_stage_change","on":false}]'::jsonb,
    'settings', '{"quietHours":true,"reEnter":false}'::jsonb))
) v(name, on_, def)
where not exists (select 1 from public.workflows w where w.is_template and w.name = v.name);

-- The old daily digest's cron was switched off, so agents weren't getting it:
-- new accounts get the daily summary switched off too (one switch to turn on).
update public.workflows set standard_on = false where is_template and standard and trigger_kind = 'daily_at';

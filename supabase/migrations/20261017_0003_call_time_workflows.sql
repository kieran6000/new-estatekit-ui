-- Workflows for the call time a lead picks ("When suits you for a quick
-- call?", on the form or the thank-you page). Add-only.
--
--  * leads.call_at: that time as a real moment. The answer is text with no
--    year ("Fri 17 Oct, around 10:00"); a trigger works it out whenever the
--    answers change, so every way of saving it (form, thank-you page) counts.
--  * Two triggers: "Lead picks a call time" (call_time_picked) and "Before or
--    after their call time" (call_time), counted like appointments. A new
--    time stops what was waiting on the old one.
--  * Four standard workflows, for every account: tell the agent (+ a reminder
--    at that time), 15 minutes before, a reminder email to the lead 2 hours
--    before, and a missed-call check an hour after. They only ever run for
--    leads who picked a time.

alter table public.leads add column if not exists call_at timestamptz;

-- "Fri 17 Oct, around 10:00" → that moment in South African time. No year in
-- the text: the year that puts it nearest after p_from (it's at most a week
-- ahead when picked). NULL when it isn't a call time.
create or replace function public.call_time_at(p_text text, p_from timestamptz)
returns timestamptz
language plpgsql
immutable
set search_path = public
as $$
declare
  m text[];
  v_mon int;
  v_base date := (p_from at time zone 'Africa/Johannesburg')::date;
  v_ts timestamp;
begin
  -- "Sept" as well as "Sep": newer browsers write September that way.
  m := regexp_match(coalesce(p_text, ''), '(\d{1,2}) ([A-Za-z]{3})[A-Za-z]?,? around ([0-2]\d):([0-5]\d)\s*$');
  if m is null then return null; end if;
  v_mon := array_position(array['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'], lower(m[2]));
  if v_mon is null then return null; end if;
  begin
    v_ts := make_timestamp(extract(year from v_base)::int, v_mon, m[1]::int, m[3]::int, m[4]::int, 0);
    if v_ts::date < v_base - 30 then
      v_ts := make_timestamp(extract(year from v_base)::int + 1, v_mon, m[1]::int, m[3]::int, m[4]::int, 0);
    end if;
  exception when others then
    return null;
  end;
  return v_ts at time zone 'Africa/Johannesburg';
end;
$$;

-- The call-time answer among a lead's answers (the last one, if several).
create or replace function public.lead_call_text(p_answers jsonb)
returns text
language sql
immutable
set search_path = public
as $$
  select e->>'a'
    from jsonb_array_elements(case when jsonb_typeof(p_answers) = 'array' then p_answers else '[]'::jsonb end) with ordinality x(e, i)
   where e->>'a' ~ '\d{1,2} [A-Za-z]{3,4},? around [0-2]\d:[0-5]\d\s*$'
   order by i desc
   limit 1;
$$;

create or replace function public.track_call_time()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new text := lead_call_text(new.form_answers);
begin
  if tg_op = 'UPDATE' and v_new is not distinct from lead_call_text(old.form_answers) then
    return new;
  end if;
  new.call_at := call_time_at(v_new, now());
  return new;
exception when others then
  -- Never stop a lead being saved.
  return new;
end;
$$;
drop trigger if exists leads_track_call_time on public.leads;
create trigger leads_track_call_time before insert or update of form_answers on public.leads
  for each row execute function public.track_call_time();

-- Leads that already picked one (worked out from when they came in).
update public.leads set call_at = public.call_time_at(public.lead_call_text(form_answers), created_at)
 where call_at is null and public.lead_call_text(form_answers) is not null;

-- Call-time workflows go once per call time (a new time is a new one).
create or replace function public.enroll_workflow(p_wf public.workflows, p_lead public.leads, p_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reenter boolean := coalesce((p_wf.definition->'settings'->>'reEnter')::boolean, false);
  v_keyed boolean := v_reenter or p_wf.trigger_kind in ('appointment', 'call_time', 'call_time_picked');
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
      -- Picked a call time on the form itself.
      if new.call_at is not null and new.call_at > now() then
        for wf in select * from workflows where agent_id = new.agent_id and published and trigger_kind = 'call_time_picked' loop
          perform enroll_workflow(wf, new, 'call-' || extract(epoch from new.call_at)::bigint);
        end loop;
      end if;
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

  -- A new call time (e.g. picked on the thank-you page, or changed): what was
  -- waiting on the old one stops, and "Lead picks a call time" starts.
  if old.call_at is distinct from new.call_at then
    if old.call_at is not null then
      update workflow_runs r
         set status = 'stopped', updated_at = now(),
             stop_reason = case when new.call_at is null then 'The call time was taken off' else 'They picked a new call time' end
        from workflows w
       where r.lead_id = new.id and r.workflow_id = w.id and r.status in ('pending', 'paused')
         and w.trigger_kind in ('call_time', 'call_time_picked');
    end if;
    if new.call_at is not null and new.call_at > now() and not new.archived then
      for wf in select * from workflows where agent_id = new.agent_id and published and trigger_kind = 'call_time_picked' loop
        perform enroll_workflow(wf, new, 'call-' || extract(epoch from new.call_at)::bigint);
      end loop;
    end if;
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

-- The clock: as before, plus "before or after their call time".
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

  -- Before or after the call time a lead picked: the same rules as an
  -- appointment (within an hour of its moment; a "before" never once it's
  -- passed). Keyed on the time: once per call time.
  for wf in select * from workflows where published and not is_template and trigger_kind = 'call_time' loop
    begin
      v_off := make_interval(mins => greatest(1, coalesce((wf.definition->'trigger'->>'amount')::int, 15))
        * case wf.definition->'trigger'->>'unit' when 'days' then 1440 when 'hours' then 60 else 1 end);
      v_after := coalesce(wf.definition->'trigger'->>'when', 'before') = 'after';
    exception when others then
      continue;
    end;
    for l in
      select * from leads ld
       where ld.agent_id = wf.agent_id and not ld.archived and ld.call_at is not null
         and (case when v_after then ld.call_at + v_off else ld.call_at - v_off end) <= now()
         and (case when v_after then ld.call_at + v_off else ld.call_at - v_off end) > now() - interval '1 hour'
         and (v_after or ld.call_at > now())
         and not exists (
           select 1 from workflow_runs r where r.workflow_id = wf.id and r.lead_id = ld.id
              and r.trigger_key = 'call-' || extract(epoch from ld.call_at)::bigint
         )
       limit 200
    loop
      perform enroll_workflow(wf, l, 'call-' || extract(epoch from l.call_at)::bigint);
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

-- The four standard call-time workflows (KEEP IN STEP with TEMPLATES in
-- src/lib/workflow.ts), then every account's copy, switched on.
insert into public.workflows (agent_id, is_template, name, published, standard, standard_on, definition)
select null, true, v.name, false, true, true, v.def from (values
  ('Call time picked — tell the agent', jsonb_build_object(
    'trigger', '{"kind":"call_time_picked"}'::jsonb,
    'filters', '[]'::jsonb,
    'steps', jsonb_build_array(
      jsonb_build_object('id','mct1rem','type','reminder','label','Call {{first_name}}: they picked this time','inDays',0),
      jsonb_build_object('id','mct1wa','type','whatsapp_agent','text', E'{{name}} picked a time for your call: {{call_time}}.\n{{phone}}\n\nIt''s on your list. Call and log it: {{action_link}}')),
    'exits', '[{"kind":"booked","on":true},{"kind":"lost","on":true},{"kind":"any_stage_change","on":false}]'::jsonb,
    'settings', '{"quietHours":true,"reEnter":false}'::jsonb)),
  ('Call time — 15 minutes before', jsonb_build_object(
    'trigger', '{"kind":"call_time","amount":15,"unit":"minutes","when":"before"}'::jsonb,
    'filters', '[]'::jsonb,
    'steps', jsonb_build_array(
      jsonb_build_object('id','mct15wa','type','whatsapp_agent','text', E'In 15 minutes: call {{name}} ({{call_time}}).\n{{phone}}\n\nCall and log it: {{action_link}}')),
    'exits', '[{"kind":"booked","on":true},{"kind":"lost","on":true},{"kind":"any_stage_change","on":false}]'::jsonb,
    'settings', '{"quietHours":false,"reEnter":false}'::jsonb)),
  ('Call time — reminder email to the lead', jsonb_build_object(
    'trigger', '{"kind":"call_time","amount":2,"unit":"hours","when":"before"}'::jsonb,
    'filters', '[{"field":"has_email","value":"yes"}]'::jsonb,
    'steps', jsonb_build_array(
      jsonb_build_object('id','mct2em','type','email_lead','subject','Speak soon, {{first_name}}','body',
        E'Hi {{first_name}},\n\nJust a reminder that I''ll call you {{call_time}}, from {{agent_phone}}. Save my number so you know it''s me.\n\nIf that time doesn''t suit you any more, just reply to this email.\n\n{{agent_name}}\n{{agent_phone}}')),
    'exits', '[{"kind":"booked","on":true},{"kind":"lost","on":true},{"kind":"any_stage_change","on":false}]'::jsonb,
    'settings', '{"quietHours":false,"reEnter":false}'::jsonb)),
  ('Call time — missed call check', jsonb_build_object(
    'trigger', '{"kind":"call_time","amount":1,"unit":"hours","when":"after"}'::jsonb,
    'filters', '[]'::jsonb,
    'steps', jsonb_build_array(jsonb_build_object('id','mctmb1','type','branch','check','stage_is','value','New Lead',
      'yes', jsonb_build_array(jsonb_build_object('id','mctmwa','type','whatsapp_agent','text','{{name}} picked {{call_time}} for your call, and it isn''t logged yet. Call now: {{action_link}}')),
      'no', jsonb_build_array(jsonb_build_object('id','mctmb2','type','branch','check','stage_is','value','No Answer',
        'yes', jsonb_build_array(jsonb_build_object('id','mctmb3','type','branch','check','has_email','value','',
          'yes', jsonb_build_array(jsonb_build_object('id','mctmem','type','email_lead','subject','Sorry we missed each other, {{first_name}}','body',
            E'Hi {{first_name}},\n\nI tried to call you but couldn''t get through. When suits you instead? Just reply with a day and time, or WhatsApp me here: {{whatsapp_link}}\n\n{{agent_name}}\n{{agent_phone}}')),
          'no', '[]'::jsonb)),
        'no', '[]'::jsonb)))),
    'exits', '[{"kind":"booked","on":true},{"kind":"lost","on":true},{"kind":"any_stage_change","on":false}]'::jsonb,
    'settings', '{"quietHours":true,"reEnter":false}'::jsonb))
) v(name, def)
where not exists (select 1 from public.workflows w where w.is_template and w.name = v.name);

select public.add_standard_workflows(agent_id) from public.agent_profiles;

-- The end-of-day "leads still to update" nudge is an automation like any other,
-- so it belongs in the Automations screen with the same on/off switch and the
-- same editable message — not buried in a cron job only I can see.
--
-- It doesn't run through automation_runs, because those are per-lead and this is
-- one message per AGENT per day. What it borrows is the row: daily-stage-nudge
-- checks this automation's `enabled` flag before sending anything, and uses its
-- step's template_text as the message.

insert into public.automations (name, trigger_type, trigger_stage, enabled)
select 'Daily — leads still to update', 'daily_digest', null, false
where not exists (
  select 1 from public.automations where trigger_type = 'daily_digest'
);

-- The message. {{first_name}} and {{count}} are filled per agent;
-- {{leads_word}} is "lead" or "leads" so the sentence reads properly at 1.
insert into public.automation_steps (automation_id, step_order, delay_minutes, action_type, template_text, payload)
select a.id, 1, 0, 'send_whatsapp',
       'Hi {{first_name}}, hope you''re well.' || chr(10) || chr(10) ||
       'You have {{count}} {{leads_word}} that still need updating.' || chr(10) || chr(10) ||
       'Tap here to update them: https://leads.estatekit.co/leads',
       '{}'::jsonb
from public.automations a
where a.trigger_type = 'daily_digest'
  and not exists (
    select 1 from public.automation_steps s where s.automation_id = a.id
  );

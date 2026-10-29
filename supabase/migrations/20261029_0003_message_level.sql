-- Each agent chooses how many WhatsApps EstateKit sends them (Account →
-- "WhatsApp messages from EstateKit"). Agents told us the reminders felt like
-- being micromanaged; check-ins are the CSM's job now.
--   new_leads  : new-lead alerts only (incl. "came back" and "picked a call time")
--   morning    : those + the weekday 08:00 follow-up list (the default)
--   everything : every "WhatsApp the agent" step, reminders included
-- Only "WhatsApp the agent" steps are held back (run-automations whatsApp());
-- messages and emails to leads run as before. Add-only.
alter table public.agent_profiles
  add column if not exists message_level text not null default 'morning';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'agent_profiles_message_level_check') then
    alter table public.agent_profiles add constraint agent_profiles_message_level_check
      check (message_level in ('new_leads', 'morning', 'everything'));
  end if;
end $$;

-- Juani Blom asked for fewer messages.
update public.agent_profiles set message_level = 'new_leads' where agent_id = 'd8972e64-7363-4dd1-99e2-09c79596091c';
-- Kieran's own EK reminders keep working.
update public.agent_profiles set message_level = 'everything' where agent_id = 'c5beabe6-e009-4880-8506-59383f053312';

-- Check-up messages off for everyone ("Did X sign?", "X's call isn't logged
-- yet"), and the 17:00 report: the morning list replaces it, so nobody gets
-- two summaries a day. Switching a workflow off cancels its queued runs.
update public.workflows set standard_on = false
 where is_template and standard
   and name in ('Booked — did they sign?', 'Call time — missed call check');
update public.workflows set published = false
 where not is_template and published
   and name in ('Booked — did they sign?', 'Call time — missed call check', 'Daily — end-of-day report');

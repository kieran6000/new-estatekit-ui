-- How many WhatsApps an agent gets is set with workflows (Automations), like
-- everything else, not a separate setting: 20261029_0003's message_level
-- is no longer read (the column stays; add-only). Same result as before:
-- the reminders that level held back are switched off here instead, for
-- everyone but Kieran, and Juani has no morning list. Switch any back on
-- per account in Automations → Workflows.
update public.workflows set standard_on = false
 where is_template and standard
   and name in ('Booked — 1 hour before', 'Booked — day-before reminder', 'Call time — 15 minutes before', 'Mandate Signed — confirmation');

update public.workflows set published = false
 where not is_template and published
   and agent_id <> 'c5beabe6-e009-4880-8506-59383f053312'
   and name in ('Booked — 1 hour before', 'Booked — day-before reminder', 'Call time — 15 minutes before', 'Mandate Signed — confirmation');

-- Juani Blom: new-lead alerts only.
update public.workflows set published = false
 where agent_id = 'd8972e64-7363-4dd1-99e2-09c79596091c' and name = 'Daily — morning follow-up list';

comment on column public.agent_profiles.message_level is 'Unused since 20261029_0004: WhatsApps to the agent are set by switching workflows on/off.';

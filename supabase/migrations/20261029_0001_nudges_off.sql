-- Agents found the per-lead nudges irritating ("Following up with X yet?",
-- "Still haven't closed the loop with X?", "Still need to retry X?"): several
-- WhatsApps a day. Off for every account and for new accounts; the morning
-- follow-up list replaces them (20261029_0002). Switching a workflow off
-- cancels its waiting runs (processRun), so queued nudges never go out.
-- Turn back on per account in Workflows if anyone wants them.
update public.workflows
   set standard_on = false
 where is_template and standard
   and name in ('Contacted — follow-up sequence', 'No Answer — retry nudge');

update public.workflows
   set published = false
 where not is_template and published
   and name in ('Contacted — follow-up sequence', 'No Answer — retry nudge');

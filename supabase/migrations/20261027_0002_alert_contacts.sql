-- Lead alerts to more than one number: extra people (e.g. a team member who
-- works the account's leads) get every "WhatsApp the agent" message about a
-- lead too. Daily summaries still go to the main number only.
-- [{ "name": "Stanley", "phone": "+27631525310" }, ...]. Add-only.
alter table public.agent_profiles
  add column if not exists alert_contacts jsonb not null default '[]'::jsonb;

-- Mphokuhle Siziba's team member Stanley.
update public.agent_profiles
   set alert_contacts = '[{"name": "Stanley", "phone": "+27631525310"}]'::jsonb
 where agent_id = '8c07fd90-ea89-4100-96db-24ac012e56b8' and alert_contacts = '[]'::jsonb;

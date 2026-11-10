-- Some clients (e.g. one run by another agency) build their own forms and
-- landing pages. Add-only: off for everyone until staff switch it on.
-- Agents could already change their own lead_pages rows (RLS: agent_id =
-- auth.uid()); this only decides whether the app shows them the tools.
alter table public.agent_profiles
  add column if not exists builds_own_forms boolean not null default false;

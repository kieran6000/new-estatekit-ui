-- A lead source knows which Facebook page its form lives on.
--
-- agent_profiles.fb_page_id is a single column, so an agent with two pages had
-- one of them wrong everywhere. Bennie hit this with the Dubai recruitment ad:
-- his forms are on "APEX Real Estate", that ad's form is on "Apex Elite Real
-- Estate Brokerage", and the Add-lead-source dialog only ever listed forms from
-- the profile's page — so the form could not be connected through the UI at all.
--
-- See SPEC-multi-page-agents.md.

alter table public.lead_pages
  add column if not exists fb_page_id text;

comment on column public.lead_pages.fb_page_id is
  'The Facebook page this source''s form lives on. Null means "the agent''s own page" (agent_profiles.fb_page_id), which is correct for almost every source.';

-- Existing rows inherit the agent's page, so nothing changes for anyone today.
-- Every read falls back to the profile anyway; this just makes it explicit.
update public.lead_pages lp
set fb_page_id = ap.fb_page_id
from public.agent_profiles ap
where lp.agent_id = ap.agent_id
  and lp.fb_page_id is null
  and coalesce(ap.fb_page_id, '') <> '';

-- Bennie's Dubai form actually lives on Apex Elite, not his own page. It was
-- connected by hand before this column existed, so the backfill above would
-- have pinned it to the wrong page.
update public.lead_pages
set fb_page_id = '1327453450451767'
where fb_form_id = '1391622413169958';

create index if not exists lead_pages_fb_page_idx
  on public.lead_pages (fb_page_id) where fb_page_id is not null;

-- Check
select 'lead_pages.fb_page_id' as object,
       exists (select 1 from information_schema.columns
               where table_name = 'lead_pages' and column_name = 'fb_page_id') as ok
union all
select 'dubai form on Apex Elite',
       exists (select 1 from public.lead_pages
               where fb_form_id = '1391622413169958' and fb_page_id = '1327453450451767');

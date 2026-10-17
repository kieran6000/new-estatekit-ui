-- "WhatsApp the lead" (a workflow step, staff accounts only): a lead can be
-- marked as not wanting WhatsApps, and the step then skips them. Add-only:
-- one new column, off for everyone.
alter table public.leads add column if not exists whatsapp_opt_out boolean not null default false;

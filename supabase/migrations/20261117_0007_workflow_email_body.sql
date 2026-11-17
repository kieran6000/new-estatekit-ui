-- Keep the wording of every automated email with its record, so the Mail tab
-- can show it like any other sent email instead of a note saying it isn't
-- kept. Add-only: older rows stay null and fall back to that note.
alter table public.workflow_emails add column if not exists body_html text;

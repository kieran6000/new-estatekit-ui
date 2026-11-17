-- The same delivery ticks, per email, for the automated (workflow) emails.
-- Add-only.
--
-- Until now the reports from the email service were written against the LEAD,
-- so one bounce lit up every email that lead had ever been sent, and a tap on
-- the confirmation email's WhatsApp button showed as "Tapped a link" on all
-- eight nurture emails. The service reports each email separately, so these
-- columns keep each email's own story.
--
-- Only the `run-automations`, `resend-webhook`, `email-open` and `email-click`
-- edge functions write these (service role).

alter table public.workflow_emails
  add column if not exists delivered_at timestamptz,
  add column if not exists bounced_at timestamptz,
  add column if not exists bounce_reason text,        -- the address that failed, in plain words
  add column if not exists complained_at timestamptz, -- marked as spam
  add column if not exists clicked_at timestamptz,    -- first link tap
  add column if not exists click_count integer not null default 0,
  add column if not exists last_click_url text,
  add column if not exists last_opened_at timestamptz,
  add column if not exists open_count integer not null default 0;

-- Delivery reports arrive keyed on this.
create index if not exists workflow_emails_resend_idx on public.workflow_emails (resend_id);

-- One links table now serves both kinds of mail: the ones staff send by hand
-- (mail_sent_id) and the automated ones (workflow_email_id). Exactly one of
-- the two is filled in. The real web address stays in the row, never in the
-- tracking link, so an edited link can't be pointed somewhere else.
alter table public.mail_links alter column mail_sent_id drop not null;
alter table public.mail_links
  add column if not exists workflow_email_id uuid references public.workflow_emails(id) on delete cascade;

create index if not exists mail_links_workflow_idx on public.mail_links (workflow_email_id);

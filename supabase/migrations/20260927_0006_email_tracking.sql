-- Confirmation email tracking. Add-only.
--
-- leads.confirmation_email_id: Resend's id for the email, so the
-- resend-webhook function can match delivery/open/bounce reports to the lead.
-- New lead_events types record them in the lead's history:
--   email_delivered, email_delayed, email_bounced, email_complained,
--   email_opened (first open only), email_clicked (the WhatsApp link, counted
--   by our own /w/<lead> redirect, not Resend's link rewriting).

alter table public.leads add column if not exists confirmation_email_id text;
create index if not exists leads_confirmation_email_id_idx on public.leads (confirmation_email_id) where confirmation_email_id is not null;

alter table public.lead_events drop constraint if exists lead_events_event_type_check;
alter table public.lead_events add constraint lead_events_event_type_check check (
  event_type = any (array[
    'created', 'stage_changed', 'note_changed', 'archived', 'restored',
    'pipeline_moved', 'call', 'whatsapp_sent',
    'email_sent', 'email_failed',
    'email_delivered', 'email_delayed', 'email_bounced', 'email_complained', 'email_opened', 'email_clicked'
  ])
);

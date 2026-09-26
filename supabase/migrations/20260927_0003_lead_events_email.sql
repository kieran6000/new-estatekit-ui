-- Lead history can record the confirmation email (sent / failed). Only widens
-- the list of allowed event types; every existing value stays allowed.
alter table public.lead_events drop constraint if exists lead_events_event_type_check;
alter table public.lead_events add constraint lead_events_event_type_check check (
  event_type = any (array[
    'created', 'stage_changed', 'note_changed', 'archived', 'restored',
    'pipeline_moved', 'call', 'whatsapp_sent',
    'email_sent', 'email_failed'
  ])
);

-- To-dos and notes on a client can be for someone on the team (they get a
-- WhatsApp from the business number), and a to-do can have a due date.
-- Add-only.
alter table public.client_notes
  add column if not exists assigned_to uuid,
  add column if not exists assigned_to_name text,
  add column if not exists due_on date,
  -- Who the WhatsApp last went to, so saving again doesn't ping twice.
  add column if not exists pinged_to uuid,
  add column if not exists pinged_at timestamptz;

-- "Your to-dos" across every client: the red counts.
create index if not exists client_notes_assigned_open
  on public.client_notes (assigned_to)
  where done_at is null;

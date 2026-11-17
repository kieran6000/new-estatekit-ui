-- Team inbox (the "Mail" tab). Add-only.
--
-- The @estatekit.co mailboxes staff can open in the dashboard, and the
-- signature appended when they send from each one. Reading and sending the
-- actual mail is done by the `gmail` edge function via Google Workspace
-- domain-wide delegation; this table only lists the mailboxes and holds their
-- signatures (so we don't need the gmail.settings scope).
--
-- v1 access: any operator may open any listed mailbox (trusted staff; partner@
-- is shared anyway). Per-person locking can be added later with a join table.

create table if not exists public.mail_mailboxes (
  email text primary key,
  display_name text not null default '',
  signature text not null default '',
  sort integer not null default 100,
  created_at timestamptz not null default now()
);

alter table public.mail_mailboxes enable row level security;

drop policy if exists "Operators read mailboxes" on public.mail_mailboxes;
create policy "Operators read mailboxes" on public.mail_mailboxes
  for select to authenticated using (public.is_operator());

drop policy if exists "Operators edit mailbox signatures" on public.mail_mailboxes;
create policy "Operators edit mailbox signatures" on public.mail_mailboxes
  for update to authenticated using (public.is_operator()) with check (public.is_operator());

-- The team's mailboxes. Each person's own, plus the shared partner@ for
-- centralised client comms. Edit display names / add mailboxes as the team grows.
insert into public.mail_mailboxes (email, display_name, sort) values
  ('kieran@estatekit.co',   'Kieran',          10),
  ('aldredt@estatekit.co',  'Aldredt',         20),
  ('josephat@estatekit.co', 'Josephat',        30),
  ('khushil@estatekit.co',  'Khushil',         40),
  ('partner@estatekit.co',  'Partner (shared)', 5)
on conflict (email) do nothing;

-- Delivery ticks for the mail staff send from the team inbox. Add-only.
--
-- Gmail tells us nothing about a mail once it has gone: no opens, no clicks,
-- no delivery report. So we keep our own record of every mail sent from the
-- Mail tab and put a 1px image and rewritten links inside it, exactly the way
-- the automated emails already work. The ticks in the inbox read from here.
--
-- Only the `gmail`, `email-open` and `email-click` edge functions write these
-- rows (service role). The browser can read them and nothing more.

create table if not exists public.mail_sent (
  id uuid primary key default gen_random_uuid(),
  mailbox text not null,
  thread_id text,
  gmail_id text,
  message_id text,              -- the mail's own Message-ID, for matching bounces
  to_emails text not null default '',
  subject text not null default '',
  sent_by uuid,                 -- agent_profiles.agent_id of whoever sent it
  sent_at timestamptz not null default now(),
  opened_at timestamptz,        -- first open
  last_opened_at timestamptz,
  open_count integer not null default 0,
  clicked_at timestamptz,       -- first link tap
  click_count integer not null default 0,
  last_click_url text,
  bounced_at timestamptz,
  bounce_reason text            -- the address that failed, in plain words
);

create index if not exists mail_sent_thread_idx on public.mail_sent (mailbox, thread_id);
create index if not exists mail_sent_gmail_idx on public.mail_sent (gmail_id);
create index if not exists mail_sent_recent_idx on public.mail_sent (mailbox, sent_at desc);
create index if not exists mail_sent_msgid_idx on public.mail_sent (message_id);

-- Every link we rewrote. The destination lives here, never in the tracking
-- URL, so the redirect can't be pointed anywhere else by editing the link.
create table if not exists public.mail_links (
  id uuid primary key default gen_random_uuid(),
  mail_sent_id uuid not null references public.mail_sent(id) on delete cascade,
  url text not null,
  click_count integer not null default 0,
  first_clicked_at timestamptz,
  last_clicked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists mail_links_mail_idx on public.mail_links (mail_sent_id);

alter table public.mail_sent enable row level security;
alter table public.mail_links enable row level security;

drop policy if exists "Operators read sent mail" on public.mail_sent;
create policy "Operators read sent mail" on public.mail_sent
  for select to authenticated using (public.is_operator());

drop policy if exists "Operators read mail links" on public.mail_links;
create policy "Operators read mail links" on public.mail_links
  for select to authenticated using (public.is_operator());

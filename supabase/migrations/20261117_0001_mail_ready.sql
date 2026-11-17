-- Only the mailboxes that are actually connected should show up in Mail.
--
-- Kieran's and the shared partner@ box are live. The rest of the team's
-- addresses exist on paper but aren't connected to Gmail yet, and an inbox
-- that can't open is worse than one that isn't listed at all. Flip `ready`
-- to true as each one comes online.
--
-- Also fixes Aldredt's name, which was seeded a letter short.

alter table public.mail_mailboxes
  add column if not exists ready boolean not null default true;

update public.mail_mailboxes set display_name = 'Aldredt' where email = 'aldredt@estatekit.co';

update public.mail_mailboxes
   set ready = false
 where email in ('aldredt@estatekit.co', 'josephat@estatekit.co', 'khushil@estatekit.co');

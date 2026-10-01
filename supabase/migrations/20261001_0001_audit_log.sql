-- Audit log: account-level activity that lead history (lead_events) doesn't
-- cover: sign-ins and sign-outs, setup changes, ad pauses, automation
-- switches, password resets, operators switching into a client's account.
-- Written only by the track-activity edge function (service role), which
-- takes the actor from the caller's verified sign-in, never from the request
-- body, so entries can't be forged from the browser. Operators can read it.
-- Add-only: one new table, nothing existing changes.

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event text not null,
  category text not null,          -- login | setup | ads | automations | account
  actor_id uuid,                   -- verified from the caller's JWT; null if not signed in
  actor_name text,
  account_id uuid,                 -- the account it happened in
  detail text,
  data jsonb,
  ip text,
  country text,                    -- ISO 3166 alpha-2, from the IP
  location text,                   -- "Pretoria, Gauteng, South Africa"
  device text,                     -- raw user agent
  session_id text
);

create index if not exists audit_log_created_idx on public.audit_log (created_at desc);
create index if not exists audit_log_actor_idx on public.audit_log (actor_id, created_at desc);
create index if not exists audit_log_account_idx on public.audit_log (account_id, created_at desc);

alter table public.audit_log enable row level security;

drop policy if exists "Operators read the audit log" on public.audit_log;
create policy "Operators read the audit log" on public.audit_log
  for select to authenticated using (coalesce(public.is_operator(), false));

-- No insert/update/delete policies: only the service role writes, and nobody edits history.
revoke all on table public.audit_log from anon;
revoke insert, update, delete, truncate on table public.audit_log from authenticated;
grant select on table public.audit_log to authenticated;

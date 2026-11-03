-- Contracts the team sends clients to read and sign (Accounts → Contracts, and
-- the Contract tab on a client). The client opens /c/<token> without signing
-- in; the contract edge function serves it, logs what happens and takes the
-- signature. Every row is written only by that function (service role);
-- operators can read them.
--
-- A contract keeps its own copy of the wording (document) and that copy's
-- fingerprint (document_hash), so later template changes can't touch it. Once
-- signed, the wording and the signature can't be changed or deleted, and the
-- history can never be edited: the triggers below stop it for everyone.

create sequence if not exists public.contract_ref_seq;

create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('EK-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.contract_ref_seq')::text, 4, '0')),
  token text not null unique,
  agent_id uuid,
  title text not null,
  signer_name text not null,
  signer_company text,
  signer_phone text not null,
  signer_email text,
  document jsonb not null,
  document_hash text not null,
  created_by uuid,
  created_by_name text,
  created_at timestamptz not null default now(),
  shared_at timestamptz,
  first_opened_at timestamptz,
  last_opened_at timestamptz,
  open_count integer not null default 0,
  seconds_read integer not null default 0,
  max_scroll integer not null default 0,
  read_to_end_at timestamptz,
  signed_at timestamptz,
  signed_name text,
  signature_png text,
  signed_phone text,
  signed_ip text,
  signed_user_agent text,
  voided_at timestamptz,
  voided_by_name text
);

create index if not exists contracts_agent on public.contracts (agent_id, created_at desc);
create index if not exists contracts_created on public.contracts (created_at desc);

-- One row per visit: how long it stayed open and how far it was read.
create table if not exists public.contract_views (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts (id),
  session_id text not null,
  opened_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  seconds integer not null default 0,
  max_scroll integer not null default 0,
  ip text,
  user_agent text,
  unique (contract_id, session_id)
);

-- The history shown to the team and printed on the signed copy's record.
create table if not exists public.contract_events (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts (id),
  type text not null,
  at timestamptz not null default now(),
  actor text,
  ip text,
  user_agent text
);
create index if not exists contract_events_contract on public.contract_events (contract_id, at);

-- Signing codes sent to the client's WhatsApp. Only the code's hash is kept.
create table if not exists public.contract_codes (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts (id),
  code_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  attempts integer not null default 0,
  used_at timestamptz
);
create index if not exists contract_codes_contract on public.contract_codes (contract_id, created_at desc);

-- Signed means final. Unsigned contracts are cancelled (voided_at), not deleted.
create or replace function public.contracts_protect() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Contracts are cancelled, never deleted';
  end if;
  if new.document is distinct from old.document or new.document_hash is distinct from old.document_hash then
    raise exception 'A contract''s wording cannot change after it is created';
  end if;
  if old.signed_at is not null and (
    new.signed_at is distinct from old.signed_at or new.signed_name is distinct from old.signed_name
    or new.signature_png is distinct from old.signature_png or new.signed_phone is distinct from old.signed_phone
    or new.signed_ip is distinct from old.signed_ip or new.signed_user_agent is distinct from old.signed_user_agent
    or new.voided_at is not null
  ) then
    raise exception 'A signed contract cannot be changed';
  end if;
  return new;
end;
$$;
drop trigger if exists contracts_protect on public.contracts;
create trigger contracts_protect before update or delete on public.contracts
  for each row execute function public.contracts_protect();

create or replace function public.contract_events_protect() returns trigger language plpgsql as $$
begin
  raise exception 'Contract history cannot be changed';
end;
$$;
drop trigger if exists contract_events_protect on public.contract_events;
create trigger contract_events_protect before update or delete on public.contract_events
  for each row execute function public.contract_events_protect();

alter table public.contracts enable row level security;
alter table public.contract_views enable row level security;
alter table public.contract_events enable row level security;
alter table public.contract_codes enable row level security;

drop policy if exists "Operators read contracts" on public.contracts;
create policy "Operators read contracts" on public.contracts
  for select to authenticated using (coalesce(public.is_operator(), false));
drop policy if exists "Operators read contract views" on public.contract_views;
create policy "Operators read contract views" on public.contract_views
  for select to authenticated using (coalesce(public.is_operator(), false));
drop policy if exists "Operators read contract events" on public.contract_events;
create policy "Operators read contract events" on public.contract_events
  for select to authenticated using (coalesce(public.is_operator(), false));

revoke all on public.contracts, public.contract_views, public.contract_events, public.contract_codes from anon;
revoke all on public.contract_codes from authenticated;
revoke insert, update, delete, truncate on public.contracts, public.contract_views, public.contract_events from authenticated;
grant select on public.contracts, public.contract_views, public.contract_events to authenticated;
revoke all on sequence public.contract_ref_seq from anon, authenticated;

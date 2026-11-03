-- Kieran's own handwritten signature, drawn or uploaded once and put on every
-- contract, since the agreement names him as the provider. A contract keeps its
-- own copy inside its wording, so changing this later never touches a contract
-- that exists. Only the contract edge function (service role) reads and writes it.
create table if not exists public.contract_staff_signatures (
  agent_id uuid primary key,
  signature_png text not null,
  updated_at timestamptz not null default now()
);

alter table public.contract_staff_signatures enable row level security;
revoke all on public.contract_staff_signatures from anon, authenticated;

-- The client's initials on the "At a glance" page, locked with the signature.
alter table public.contracts add column if not exists signed_initials text;

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
    or new.signed_initials is distinct from old.signed_initials
    or new.voided_at is not null
  ) then
    raise exception 'A signed contract cannot be changed';
  end if;
  return new;
end;
$$;

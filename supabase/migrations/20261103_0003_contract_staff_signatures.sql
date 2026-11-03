-- The team member's own handwritten signature, drawn or uploaded once and put
-- on every contract they issue. A contract keeps its own copy inside its
-- wording, so changing this later never touches a contract that exists.
-- Only the contract edge function (service role) reads and writes it.
create table if not exists public.contract_staff_signatures (
  agent_id uuid primary key,
  signature_png text not null,
  updated_at timestamptz not null default now()
);

alter table public.contract_staff_signatures enable row level security;
revoke all on public.contract_staff_signatures from anon, authenticated;

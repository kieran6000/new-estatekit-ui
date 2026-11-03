-- Invoices the team sends clients (the Contract & invoices tab on a client). The
-- client opens /i/<token> without signing in; view_invoice serves it and logs
-- the open. Operators create and track them; nobody else can read the table.
--
-- An invoice keeps its own copy of what it says (document), so changing the
-- banking details later can't touch one already sent. Invoices are cancelled
-- (voided_at), never deleted, and only their status can change.

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('INV-' || to_char(now(), 'YYYY') || '-' || (100000 + floor(random() * 900000))::int),
  token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  agent_id uuid,
  client_name text not null,
  client_phone text not null,
  amount numeric(12, 2) not null check (amount > 0),
  due_date date not null,
  document jsonb not null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  shared_at timestamptz,
  first_opened_at timestamptz,
  last_opened_at timestamptz,
  open_count integer not null default 0,
  paid_at timestamptz,
  voided_at timestamptz
);

create index if not exists invoices_agent on public.invoices (agent_id, created_at desc);

alter table public.invoices enable row level security;

drop policy if exists "Operators read invoices" on public.invoices;
create policy "Operators read invoices" on public.invoices
  for select to authenticated using (coalesce(public.is_operator(), false));
drop policy if exists "Operators create invoices" on public.invoices;
create policy "Operators create invoices" on public.invoices
  for insert to authenticated with check (coalesce(public.is_operator(), false));
drop policy if exists "Operators update invoices" on public.invoices;
create policy "Operators update invoices" on public.invoices
  for update to authenticated using (coalesce(public.is_operator(), false));

revoke all on public.invoices from anon, authenticated;
grant select, insert on public.invoices to authenticated;
grant update (shared_at, paid_at, voided_at) on public.invoices to authenticated;

-- The invoice behind a /i/<token> link, or null if the link isn't real. The
-- team's own views aren't counted as the client opening it.
create or replace function public.view_invoice(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.invoices;
  staff boolean := coalesce(public.is_operator(), false);
begin
  select * into r from public.invoices where token = p_token;
  if not found then
    return null;
  end if;
  if r.voided_at is not null then
    return jsonb_build_object('status', 'cancelled', 'reference', r.reference, 'staff', staff);
  end if;
  if not staff then
    update public.invoices
      set first_opened_at = coalesce(first_opened_at, now()), last_opened_at = now(), open_count = open_count + 1
      where id = r.id;
  end if;
  return jsonb_build_object(
    'status', case when r.paid_at is not null then 'paid' else 'open' end,
    'reference', r.reference,
    'staff', staff,
    'document', r.document
  );
end;
$$;

revoke all on function public.view_invoice(text) from public;
grant execute on function public.view_invoice(text) to anon, authenticated;

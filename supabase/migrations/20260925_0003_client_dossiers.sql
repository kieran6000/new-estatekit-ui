-- Admin "Clients" tab. Add-only: one new table, one new read function.
-- Nothing existing is changed, so the live app is unaffected until the
-- website change that uses them is deployed.
--
-- client_dossiers: everything we know about a client that isn't in the app's
-- own tables — billing, onboarding answers, health, to-dos, call notes,
-- weekly feedback, ad history and linked docs. Gathered from the Google
-- Sheets/Docs and a read-only export of the old dashboard. One row per
-- account, the content is one jsonb document (its shape is ClientDossier in
-- src/api/clients.ts).
--
-- Operators only: agents never see their own dossier (it holds internal
-- notes about them).

create table if not exists public.client_dossiers (
  agent_id uuid primary key references public.agent_profiles(agent_id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.client_dossiers enable row level security;

drop policy if exists "Operators manage client dossiers" on public.client_dossiers;
create policy "Operators manage client dossiers" on public.client_dossiers
  for all to authenticated using (is_operator()) with check (is_operator());

revoke all on public.client_dossiers from anon;

-- Live numbers for the Clients grid, one row per account, in one call
-- (counting leads in the browser would hit the 1,000-row limit).
-- SECURITY INVOKER: it reads through the caller's RLS, and it also refuses
-- anyone who isn't an operator outright.
create or replace function public.client_directory()
returns table (
  agent_id uuid,
  leads_total bigint,
  leads_30d bigint,
  leads_7d bigint,
  last_lead_at timestamptz,
  lead_pages bigint,
  pipelines bigint,
  by_stage jsonb
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    p.agent_id,
    (select count(*) from leads l where l.agent_id = p.agent_id and not l.archived),
    (select count(*) from leads l where l.agent_id = p.agent_id and not l.archived and l.created_at > now() - interval '30 days'),
    (select count(*) from leads l where l.agent_id = p.agent_id and not l.archived and l.created_at > now() - interval '7 days'),
    (select max(l.created_at) from leads l where l.agent_id = p.agent_id),
    (select count(*) from lead_pages lp where lp.agent_id = p.agent_id),
    (select count(*) from pipelines pl where pl.agent_id = p.agent_id),
    coalesce((select jsonb_object_agg(s.stage, s.n) from (
      select l.stage, count(*) n from leads l where l.agent_id = p.agent_id and not l.archived group by l.stage
    ) s), '{}'::jsonb)
  from agent_profiles p
  where is_operator();
$$;

revoke all on function public.client_directory() from public, anon;
grant execute on function public.client_directory() to authenticated;

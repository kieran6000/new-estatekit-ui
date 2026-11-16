-- Phase 1 of the agency sales pipeline: our OWN client-acquisition funnel,
-- the one that turns an applicant (from /pitch or /start) into a paying
-- client, lived inside the dashboard instead of in someone's head.
--
-- Design: we LAYER, we do not touch the stage engine. A prospect's CALL
-- workflow stays exactly as it is — a lead in the "EstateKit Agents"
-- (kind=general) pipeline, with the normal stages, call list, reminders and
-- Discord cards. This table holds only the POST-first-contact lifecycle that
-- the general stages can't express: proposal, signed, paid, live, renewal,
-- churn — plus the discovery scorecard and the show-rate milestones. One row
-- per prospect, linked to the lead it came from (and, once they sign, to the
-- agent_profiles row that becomes their client account).
--
-- Add-only. Nothing existing is renamed or dropped. The old app never reads
-- this table, so it keeps working untouched (expand/contract, SHIPPING.md §4).
-- Operator-only: these are our internal sales records, never an agent's.

create table if not exists public.agency_deals (
  id uuid primary key default gen_random_uuid(),

  -- Where the prospect came from. A /pitch applicant has a lead; a /start
  -- sign-up has a signup_request; a hand-added deal may have neither. Once
  -- they sign, agent_id points at the client account they became.
  lead_id            uuid references public.leads(id) on delete set null,
  signup_request_id  uuid references public.signup_requests(id) on delete set null,
  agent_id           uuid references public.agent_profiles(agent_id) on delete set null,

  -- The lifecycle stage. The early part mirrors the lead's own stage (so the
  -- Sales screen can show the whole journey in one place); from 'proposal_sent'
  -- on, this row is the source of truth.
  stage text not null default 'applied'
    check (stage in (
      'applied',       -- came in, not yet on a call
      'call_booked',   -- discovery call scheduled
      'showed',        -- turned up to the call
      'no_show',       -- booked, did not turn up
      'proposal_sent', -- plan / quote sent
      'signed',        -- contract signed
      'paid',          -- first invoice paid
      'live',          -- campaign launched (they're a client)
      'renewal_due',   -- contract ending within 30 days
      'churned',       -- client left
      'lost'           -- never became a client
    )),

  -- Discovery scorecard: the handful of facts every sales call turns on.
  -- Typed, not jsonb, so the Sales table can sort and filter on them.
  leads_per_month   int,
  deals_per_month   int,
  tried_before      text,            -- what they ran before (and how it went)
  tried_before_cost text,            -- what that cost them, in their words
  budget            text,            -- monthly ad budget they named
  target_suburbs    text,            -- suburbs they want (for the Phase 2 clash check)
  decision_date     date,            -- when they said they'd decide
  scorecard_notes   text,

  -- The call itself.
  fathom_url     text,               -- the recording link
  fathom_summary text,               -- pasted / pulled summary, shown on the card

  -- One next action with a reason, so "circle back in December" is a date on
  -- the card, not a memory. Drives the Sales follow-up list.
  next_action_at     timestamptz,
  next_action_reason text,

  -- Why a deal was lost or a client churned (price, went with a competitor…).
  lost_reason text,

  -- The commercial offer. Default is today's standard; kept as text so it can
  -- vary per deal without a pricing table.
  pricing_plan text not null default 'R7,500 for 3 months + ad spend',

  -- Links to the paper, filled in Phase 2. No hard coupling to the immutable
  -- contract row: a voided-and-recreated contract just updates this pointer.
  contract_id uuid,
  invoice_id  uuid references public.invoices(id) on delete set null,

  -- Milestone timestamps. Each is set the first time the deal reaches that
  -- point; together they give show-rate, time-to-sign and time-to-launch
  -- without a separate events table.
  applied_at      timestamptz not null default now(),
  call_booked_at  timestamptz,
  call_at         timestamptz,       -- the scheduled call time
  showed_at       timestamptz,
  no_show_at      timestamptz,
  proposal_sent_at timestamptz,
  signed_at       timestamptz,
  paid_at         timestamptz,
  live_at         timestamptz,
  renewal_due_at  timestamptz,
  churned_at      timestamptz,
  lost_at         timestamptz,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One deal per lead, and one per sign-up, so backfill and the /start merge
-- can't create duplicates. (Partial unique indexes: nulls don't collide.)
create unique index if not exists agency_deals_lead_uniq
  on public.agency_deals (lead_id) where lead_id is not null;
create unique index if not exists agency_deals_signup_uniq
  on public.agency_deals (signup_request_id) where signup_request_id is not null;
create index if not exists agency_deals_stage_idx on public.agency_deals (stage);
create index if not exists agency_deals_agent_idx on public.agency_deals (agent_id);
create index if not exists agency_deals_next_action_idx on public.agency_deals (next_action_at);

-- updated_at, same trigger helper the rest of the schema uses if present;
-- fall back to an inline one so this migration stands alone.
create or replace function public.agency_deals_touch()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists agency_deals_touch on public.agency_deals;
create trigger agency_deals_touch before update on public.agency_deals
  for each row execute function public.agency_deals_touch();

-- Operator-only, like contracts / invoices / signup_requests.
alter table public.agency_deals enable row level security;
drop policy if exists "Operators manage agency deals" on public.agency_deals;
create policy "Operators manage agency deals" on public.agency_deals
  for all using (coalesce(public.is_operator(), false))
  with check (coalesce(public.is_operator(), false));

-- ── Backfill ────────────────────────────────────────────────────────────────
-- One deal per existing lead in the EstateKit Agents pipeline, mapping the
-- lead's current stage to a lifecycle stage. Idempotent via the unique index.
insert into public.agency_deals (lead_id, agent_id, stage, applied_at, call_booked_at, call_at, signed_at, lost_at, created_at)
select
  l.id,
  null,
  case l.stage
    when 'Booked'          then 'call_booked'
    when 'Mandate Signed'  then 'signed'
    when 'Lost'            then 'lost'
    when 'Invalid Number'  then 'lost'
    else 'applied'
  end,
  l.created_at,
  case when l.stage = 'Booked' then coalesce(l.appointment_at, l.updated_at) end,
  case when l.stage = 'Booked' then coalesce(l.appointment_at, l.call_at) end,
  case when l.stage = 'Mandate Signed' then l.updated_at end,
  case when l.stage in ('Lost', 'Invalid Number') then l.updated_at end,
  l.created_at
from public.leads l
join public.pipelines p on p.id = l.pipeline_id
where p.name = 'EstateKit Agents'
on conflict (lead_id) where lead_id is not null do nothing;

-- One deal per sign-up request (the /start funnel), carrying its scorecard.
insert into public.agency_deals (signup_request_id, stage, budget, target_suburbs, applied_at, created_at)
select
  s.id,
  case lower(coalesce(s.status, ''))
    when 'signed_up' then 'signed'
    when 'not_a_fit' then 'lost'
    else 'applied'
  end,
  s.budget,
  s.suburbs,
  s.created_at,
  s.created_at
from public.signup_requests s
on conflict (signup_request_id) where signup_request_id is not null do nothing;

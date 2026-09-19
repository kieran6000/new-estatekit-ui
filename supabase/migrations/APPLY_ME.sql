-- ============================================================================
-- Paste this whole file into the Supabase SQL editor and run it.
--   https://supabase.com/dashboard/project/yfcnsvrhojpysrzqrkdi/sql/new
--
-- It is the three 20260919_* migrations in one block, in order. Safe to run
-- more than once — every statement is guarded.
--
-- Until this runs, the app is fine: end pages and the Conversions API panel
-- stay hidden, and forms work exactly as they did before.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Answer routing + custom end pages
-- ---------------------------------------------------------------------------

alter table public.custom_questions
  add column if not exists answer_routes jsonb not null default '{}'::jsonb;

comment on column public.custom_questions.answer_routes is
  'Answer text -> destination. Values: next | q:<question_id> | end:thanks | end:not_a_fit | end:<ending_id>. Absent means carry on.';

create table if not exists public.lead_page_endings (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.lead_pages(id) on delete cascade,
  agent_id uuid not null,
  name text not null default 'End page',
  headline text not null default 'Thanks!',
  subtext text not null default '',
  -- lead        a real lead; reported to Facebook as a conversion
  -- quiet_lead  a real lead, but NOT reported to Facebook
  -- no_lead     not a lead at all; a polite goodbye
  outcome text not null default 'lead',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint lead_page_endings_outcome_check
    check (outcome in ('lead', 'quiet_lead', 'no_lead'))
);

alter table public.lead_page_endings enable row level security;

drop policy if exists "Anyone can read lead page endings" on public.lead_page_endings;
create policy "Anyone can read lead page endings"
  on public.lead_page_endings for select using (true);

drop policy if exists "Agents manage own endings" on public.lead_page_endings;
create policy "Agents manage own endings"
  on public.lead_page_endings for all
  using (agent_id = auth.uid() or is_operator())
  with check (agent_id = auth.uid() or is_operator());

create index if not exists lead_page_endings_page_idx
  on public.lead_page_endings (page_id, sort_order);

alter table public.leads
  add column if not exists quality text not null default 'good';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'leads_quality_check') then
    alter table public.leads
      add constraint leads_quality_check check (quality in ('good', 'weak'));
  end if;
end $$;

create index if not exists leads_quality_idx on public.leads (quality) where quality <> 'good';


-- ---------------------------------------------------------------------------
-- 2. Facebook Conversions API
--    Tokens live here, NOT on lead_pages — that table is publicly readable so
--    the landing page can render, and a token there would leak to visitors.
-- ---------------------------------------------------------------------------

create table if not exists public.fb_capi_config (
  pixel_id text primary key,
  access_token text not null,
  enabled boolean not null default false,
  test_event_code text,
  label text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.fb_capi_config enable row level security;

drop policy if exists "Operators read capi config" on public.fb_capi_config;
create policy "Operators read capi config"
  on public.fb_capi_config for select using (is_operator());

drop policy if exists "Operators write capi config" on public.fb_capi_config;
create policy "Operators write capi config"
  on public.fb_capi_config for all
  using (is_operator()) with check (is_operator());

drop trigger if exists fb_capi_config_set_updated_at on public.fb_capi_config;
create trigger fb_capi_config_set_updated_at
  before update on public.fb_capi_config
  for each row execute function public.set_updated_at();

create table if not exists public.fb_capi_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete set null,
  pixel_id text not null,
  event_id text not null unique,
  event_name text not null,
  status text not null,
  response text,
  created_at timestamptz not null default now()
);

alter table public.fb_capi_events enable row level security;

drop policy if exists "Operators read capi events" on public.fb_capi_events;
create policy "Operators read capi events"
  on public.fb_capi_events for select using (is_operator());

create index if not exists fb_capi_events_lead_idx on public.fb_capi_events (lead_id);
create index if not exists fb_capi_events_created_idx on public.fb_capi_events (created_at desc);


-- ---------------------------------------------------------------------------
-- 3. End-of-day nudge as an automation
--    Created DISABLED. Switch it on under Automations when you're happy with
--    the wording — it messages real client agents.
-- ---------------------------------------------------------------------------

insert into public.automations (name, trigger_type, trigger_stage, enabled)
select 'Daily — leads still to update', 'daily_digest', null, false
where not exists (
  select 1 from public.automations where trigger_type = 'daily_digest'
);

insert into public.automation_steps (automation_id, step_order, delay_minutes, action_type, template_text, payload)
select a.id, 1, 0, 'send_whatsapp',
       'Hi {{first_name}}, hope you''re well.' || chr(10) || chr(10) ||
       'You have {{count}} {{leads_word}} that still need updating.' || chr(10) || chr(10) ||
       'Tap here to update them: https://leads.estatekit.co/leads',
       '{}'::jsonb
from public.automations a
where a.trigger_type = 'daily_digest'
  and not exists (select 1 from public.automation_steps s where s.automation_id = a.id);


-- ---------------------------------------------------------------------------
-- Check it worked
-- ---------------------------------------------------------------------------
select 'lead_page_endings' as object,
       to_regclass('public.lead_page_endings') is not null as ok
union all
select 'fb_capi_config', to_regclass('public.fb_capi_config') is not null
union all
select 'fb_capi_events', to_regclass('public.fb_capi_events') is not null
union all
select 'custom_questions.answer_routes',
       exists (select 1 from information_schema.columns
               where table_name = 'custom_questions' and column_name = 'answer_routes')
union all
select 'leads.quality',
       exists (select 1 from information_schema.columns
               where table_name = 'leads' and column_name = 'quality')
union all
select 'daily_digest automation',
       exists (select 1 from public.automations where trigger_type = 'daily_digest');

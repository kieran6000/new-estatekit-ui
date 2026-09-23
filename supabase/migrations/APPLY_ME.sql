-- ============================================================================
-- Paste this whole file into the Supabase SQL editor and run it.
--   https://supabase.com/dashboard/project/yfcnsvrhojpysrzqrkdi/sql/new
--
-- It is the three 20260919_* migrations in one block, in order. Safe to run
-- more than once — every statement is guarded.
--
-- Until this runs the app is fine: the Conversions API panel stays hidden, the
-- per-answer setting silently does nothing, and forms work exactly as before.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Lead quality: answers you take but do not count as conversions
-- ---------------------------------------------------------------------------

alter table public.custom_questions
  add column if not exists low_quality_answers text[] not null default '{}'::text[];

comment on column public.custom_questions.low_quality_answers is
  'Answers that still create a lead but are not reported to Facebook as a conversion. Distinct from disqualify_answers, which creates no lead at all.';

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
-- 4. Commission: expected vs actually received
--    A signed mandate is permission to sell, not a sale. Without this the
--    Overview counted a mandate as money in the bank the day it was signed,
--    so "actual profit" and "actual ROI" were reporting cash nobody had.
-- ---------------------------------------------------------------------------

alter table public.leads
  add column if not exists commission_received_at timestamptz;

comment on column public.leads.commission_received_at is
  'When the commission was actually banked. Null = still only expected. Only leads with this set count toward earned commission on the Overview.';

create index if not exists leads_commission_received_idx
  on public.leads (commission_received_at) where commission_received_at is not null;


-- ---------------------------------------------------------------------------
-- 5. Agent profile photo, separate from the sidebar logo
--    One field was doing both jobs, so a client photo sat where an agency
--    logo belonged.
-- ---------------------------------------------------------------------------

alter table public.agent_profiles
  add column if not exists avatar_url text;

comment on column public.agent_profiles.avatar_url is
  'The agent''s face. sidebar_logo_url stays the agency/brand mark.';


-- ---------------------------------------------------------------------------
-- 6. "General" pipeline kind
--    Third preset alongside seller and buyer, for lead types that are neither
--    (recruitment being the reason it exists). Same stage machinery, generic
--    wording, so no custom work per client.
-- ---------------------------------------------------------------------------

do $
begin
  if exists (select 1 from pg_constraint where conname = 'pipelines_kind_check') then
    alter table public.pipelines drop constraint pipelines_kind_check;
  end if;
  alter table public.pipelines
    add constraint pipelines_kind_check check (kind in ('seller', 'buyer', 'general'));
end $;


-- ---------------------------------------------------------------------------
-- Check it worked
-- ---------------------------------------------------------------------------
select 'fb_capi_config' as object, to_regclass('public.fb_capi_config') is not null as ok
union all
select 'fb_capi_events', to_regclass('public.fb_capi_events') is not null
union all
select 'custom_questions.low_quality_answers',
       exists (select 1 from information_schema.columns
               where table_name = 'custom_questions' and column_name = 'low_quality_answers')
union all
select 'leads.quality',
       exists (select 1 from information_schema.columns
               where table_name = 'leads' and column_name = 'quality')
union all
select 'daily_digest automation',
       exists (select 1 from public.automations where trigger_type = 'daily_digest')
union all
select 'leads.commission_received_at',
       exists (select 1 from information_schema.columns
               where table_name = 'leads' and column_name = 'commission_received_at')
union all
select 'agent_profiles.avatar_url',
       exists (select 1 from information_schema.columns
               where table_name = 'agent_profiles' and column_name = 'avatar_url')
union all
select 'pipelines allows general',
       pg_get_constraintdef(oid) like '%general%'
       from pg_constraint where conname = 'pipelines_kind_check';

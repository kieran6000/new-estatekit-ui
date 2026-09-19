-- Facebook Conversions API credentials.
--
-- Deliberately NOT a column on lead_pages: that table has an "Anyone can read
-- lead_pages publicly" policy so the public landing page can render without a
-- session. A CAPI access token stored there would be readable by every visitor.
--
-- This table is operator-only for reads and has no public policy at all. The
-- edge function reads it as service_role, which bypasses RLS.

create table if not exists public.fb_capi_config (
  pixel_id text primary key,
  access_token text not null,
  -- Off by default: sending real conversion events to a client's pixel is not
  -- something that should start happening merely because a token was pasted in.
  enabled boolean not null default false,
  -- Meta shows events sent with this code as "test" and keeps them out of ad
  -- optimisation. Set it while verifying the wiring, clear it to go live.
  test_event_code text,
  label text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.fb_capi_config enable row level security;

-- No anon/authenticated policy: only operators can see that a config exists,
-- and nobody reads the token through PostgREST.
create policy "Operators read capi config"
  on public.fb_capi_config for select
  using (is_operator());

create policy "Operators write capi config"
  on public.fb_capi_config for all
  using (is_operator())
  with check (is_operator());

drop trigger if exists fb_capi_config_set_updated_at on public.fb_capi_config;
create trigger fb_capi_config_set_updated_at
  before update on public.fb_capi_config
  for each row execute function public.set_updated_at();

-- Every conversion we report to Meta, so a mis-send can be traced and so the
-- same lead is never reported twice (event_id is Meta's dedupe key, shared with
-- the browser pixel so one conversion isn't counted as two).
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

create policy "Operators read capi events"
  on public.fb_capi_events for select
  using (is_operator());

create index if not exists fb_capi_events_lead_idx on public.fb_capi_events (lead_id);
create index if not exists fb_capi_events_created_idx on public.fb_capi_events (created_at desc);

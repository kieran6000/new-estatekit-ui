-- Stop the app exhausting its own Facebook quota.
--
-- Facebook's rate limit is per APP, shared by every client. sync-fb-leads runs
-- every 5 minutes and, for each agent, called me/accounts?limit=200 just to
-- resolve a page token, then leadgen_forms, then /leads per form. With ~14
-- agents that is roughly 30,000 Graph calls a day, which permanently exhausts
-- the quota — so small consumers like the Forms page could never get through.
--
-- Two caches and a circuit breaker fix it:

-- 1. Page tokens. These are derived from long-lived user tokens and do not
--    change, yet were re-fetched from Graph on every single request via the
--    most expensive call we make. Caching them removes that call entirely.
create table if not exists public.fb_page_tokens (
  page_id text primary key,
  access_token text not null,
  -- Which vault secret produced it, so a rotated user token invalidates
  -- only the page tokens that came from it.
  source_secret text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.fb_page_tokens enable row level security;
-- No policies: edge functions read this as service_role, and nothing else
-- should ever see a page token.

-- 2. Form definitions. A published instant form's questions effectively never
--    change, but the Forms page re-fetched them on every visit.
create table if not exists public.fb_form_cache (
  form_id text primary key,
  page_id text,
  payload jsonb not null,
  fetched_at timestamptz not null default now()
);

alter table public.fb_form_cache enable row level security;

-- Readable by signed-in users so the dashboard can fall back to the cached
-- copy while Facebook is throttling us.
create policy "Signed-in users read cached forms"
  on public.fb_form_cache for select
  to authenticated using (true);

-- 3. Circuit breaker. When Facebook returns code 4/17/32/613, every function
--    stops calling until this passes. Without it, each throttled call spends
--    more of the quota that is already gone — the outage sustains itself.
create table if not exists public.fb_api_state (
  id boolean primary key default true,
  backoff_until timestamptz,
  last_error text,
  updated_at timestamptz not null default now(),
  constraint fb_api_state_single_row check (id)
);

insert into public.fb_api_state (id) values (true) on conflict (id) do nothing;

alter table public.fb_api_state enable row level security;

create policy "Signed-in users read fb api state"
  on public.fb_api_state for select
  to authenticated using (true);

-- Slow the poll down. Instant-form leads also arrive via fb-lead-webhook; this
-- cron is the safety net, and every 5 minutes was far more often than the
-- safety net needs to run.
select cron.alter_job(
  (select jobid from cron.job where jobname = 'sync-fb-leads-every-5-min'),
  schedule := '*/15 * * * *'
);

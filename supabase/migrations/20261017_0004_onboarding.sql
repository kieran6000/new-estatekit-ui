-- /onboarding: the form new clients fill in after saying yes on the call
-- (it replaces the "EstateKit Onboarding" Google Form). Add-only.
--
--  * onboarding_submissions: every answer, the photo and logo links, and
--    what happened: their account created (or already there) and whether
--    they watched the "what happens next" video. Written only by the
--    submit-onboarding function; staff read it.
--  * app_settings: a few settings staff change without a code change. For
--    now only the "what happens next" video, which the public page reads
--    through get_public_setting (only the keys listed there).
--  * onboarding_watched(token): the page's "I've watched the video" button.

create table if not exists public.onboarding_submissions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  email text not null,
  phone text not null,
  agency text not null,
  website text,
  business_address text,
  campaign text not null,
  city text,
  suburbs text[] not null default '{}',
  price_range text,
  deals_closed text,
  special_offer text,
  headshot_url text,
  logo_url text,
  -- The account: 'created', 'existing' (that number already had one) or 'failed'.
  agent_id uuid references public.agent_profiles(agent_id) on delete set null,
  account_status text,
  login_sent text,
  -- The private code in their "what happens next" link.
  token text not null unique,
  video_watched_at timestamptz
);
create index if not exists onboarding_submissions_created on public.onboarding_submissions (created_at desc);
create index if not exists onboarding_submissions_phone on public.onboarding_submissions (phone, created_at desc);

alter table public.onboarding_submissions enable row level security;
drop policy if exists "Operators read onboarding submissions" on public.onboarding_submissions;
create policy "Operators read onboarding submissions" on public.onboarding_submissions
  for select to authenticated using (is_operator());
revoke all on public.onboarding_submissions from anon;

create table if not exists public.app_settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
drop policy if exists "Operators manage app settings" on public.app_settings;
create policy "Operators manage app settings" on public.app_settings
  for all to authenticated using (is_operator()) with check (is_operator());
revoke all on public.app_settings from anon;

-- Only the settings public pages need, by name.
create or replace function public.get_public_setting(p_key text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select value from app_settings where key = p_key and p_key in ('onboarding_video_url');
$$;
revoke all on function public.get_public_setting(text) from public;
grant execute on function public.get_public_setting(text) to anon, authenticated;

create or replace function public.onboarding_watched(p_token text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if p_token is null or p_token !~ '^[a-f0-9]{32}$' then return false; end if;
  update onboarding_submissions set video_watched_at = coalesce(video_watched_at, now()) where token = p_token;
  return found;
end;
$$;
revoke all on function public.onboarding_watched(text) from public;
grant execute on function public.onboarding_watched(text) to anon, authenticated;

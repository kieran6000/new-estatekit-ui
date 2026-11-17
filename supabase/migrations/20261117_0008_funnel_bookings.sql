-- Funnel discovery-call bookings (estatekit.co/pitch). A prospect agent picks
-- a real time; later edge functions create a Google Calendar event + Meet link
-- as partner@ and move their agency lead to "Call booked". ADD-ONLY: two new
-- tables, nothing touches the live funnel until the booking functions ship.
--
-- Availability RULES live in booking_config (editable, no code). The actual
-- free/busy comes from partner@'s Google Calendar at the moment slots are asked
-- for, so a time is never offered twice. Safe to run more than once.

-- 1. Editable rules for the funnel's availability.
create table if not exists public.booking_config (
  slug              text primary key,                 -- 'pitch'
  time_zone         text    not null default 'Africa/Johannesburg',
  slot_minutes      int     not null default 30,
  buffer_minutes    int     not null default 0,        -- gap kept after each call
  lead_time_minutes int     not null default 120,      -- earliest a slot can be booked from now
  window_days       int     not null default 14,       -- how far ahead times are offered
  weekly_hours      jsonb   not null default '{"mon":[["09:00","16:00"]],"tue":[["09:00","16:00"]],"wed":[["09:00","16:00"]],"thu":[["09:00","16:00"]],"fri":[["09:00","15:00"]]}'::jsonb,
  calendar_email    text    not null default 'partner@estatekit.co',
  active            boolean not null default true,
  updated_at        timestamptz not null default now()
);

-- 2. One row per booked call.
create table if not exists public.bookings (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null default 'pitch',
  lead_id          uuid references public.leads(id) on delete set null,
  agent_id         uuid,                               -- the account the lead sits under
  starts_at        timestamptz not null,
  ends_at          timestamptz not null,
  time_zone        text not null default 'Africa/Johannesburg',
  status           text not null default 'booked',     -- booked|rescheduled|cancelled|showed|no_show|completed
  name             text,
  email            text,
  phone            text,
  answers          jsonb,
  google_event_id  text,
  meet_url         text,
  event_link       text,
  reschedule_token text unique not null default replace(gen_random_uuid()::text, '-', ''),
  reschedule_count int  not null default 0,
  reminded_24h_at  timestamptz,
  reminded_1h_at   timestamptz,
  cancelled_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists bookings_lead_idx   on public.bookings(lead_id);
create index if not exists bookings_starts_idx on public.bookings(starts_at);
create index if not exists bookings_status_idx on public.bookings(status);

-- Keep updated_at honest, the same way every other table here does.
drop trigger if exists booking_config_set_updated_at on public.booking_config;
create trigger booking_config_set_updated_at
  before update on public.booking_config
  for each row execute function public.set_updated_at();

drop trigger if exists bookings_set_updated_at on public.bookings;
create trigger bookings_set_updated_at
  before update on public.bookings
  for each row execute function public.set_updated_at();

alter table public.booking_config enable row level security;
alter table public.bookings       enable row level security;

-- Operators (EstateKit staff) see and manage bookings in the dashboard; the
-- edge functions write with the service role, which bypasses RLS entirely.
drop policy if exists bookings_operator_all on public.bookings;
create policy bookings_operator_all on public.bookings
  for all to authenticated using (public.is_operator()) with check (public.is_operator());

drop policy if exists booking_config_operator_all on public.booking_config;
create policy booking_config_operator_all on public.booking_config
  for all to authenticated using (public.is_operator()) with check (public.is_operator());

-- Seed the funnel's config row (idempotent).
insert into public.booking_config (slug) values ('pitch') on conflict (slug) do nothing;

-- Check it worked.
select 'booking_config' as object, to_regclass('public.booking_config') is not null as ok
union all
select 'bookings', to_regclass('public.bookings') is not null
union all
select 'pitch config seeded', exists (select 1 from public.booking_config where slug = 'pitch');

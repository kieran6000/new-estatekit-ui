-- Where an address is on the map, so Google is only asked once per address.
-- Add-only: one new table. Signed-in users read and add; nobody edits. A row
-- with no lat/lng means Google found nothing for that address.
create table if not exists public.geocode_cache (
  address_key text primary key,
  lat double precision,
  lng double precision,
  exact boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.geocode_cache enable row level security;

drop policy if exists "Signed-in users read geocodes" on public.geocode_cache;
create policy "Signed-in users read geocodes"
  on public.geocode_cache for select to authenticated using (true);

drop policy if exists "Signed-in users add geocodes" on public.geocode_cache;
create policy "Signed-in users add geocodes"
  on public.geocode_cache for insert to authenticated with check (true);

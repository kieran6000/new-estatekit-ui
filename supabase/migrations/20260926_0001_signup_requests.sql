-- Free-account requests from the public /start page (reached from the
-- "Powered by EstateKit" link on clients' lead pages). Add-only: one new
-- table and one new function; nothing existing changes.
--
-- The public can't touch the table directly. They go through
-- request_signup(), which validates, trims and caps every field and ignores
-- repeat submissions from the same number within a day. Operators read and
-- update the table (the Clients page lists new requests).

create table if not exists public.signup_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  whatsapp text not null,
  agency text not null default '',
  wants text[] not null default '{}',
  suburbs text not null default '',
  budget text not null default '',
  ref text,          -- slug of the client lead page they came from
  source text,       -- 'lead_page' | 'thank_you' | null (direct)
  status text not null default 'new' check (status in ('new', 'contacted', 'signed_up', 'not_a_fit')),
  handled_at timestamptz,
  handled_by uuid
);

create index if not exists signup_requests_status_created_idx on public.signup_requests (status, created_at desc);

alter table public.signup_requests enable row level security;

drop policy if exists "Operators read signup requests" on public.signup_requests;
create policy "Operators read signup requests" on public.signup_requests
  for select to authenticated using (is_operator());

drop policy if exists "Operators update signup requests" on public.signup_requests;
create policy "Operators update signup requests" on public.signup_requests
  for update to authenticated using (is_operator()) with check (is_operator());

revoke all on public.signup_requests from anon;

create or replace function public.request_signup(
  p_name text,
  p_whatsapp text,
  p_agency text,
  p_wants text[],
  p_suburbs text,
  p_budget text,
  p_ref text default null,
  p_source text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_digits text := regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g');
  v_id uuid;
begin
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'name_required'; end if;
  if length(v_digits) < 9 or length(v_digits) > 15 then raise exception 'phone_invalid'; end if;
  if v_digits ~ '^0\d{9}$' then v_digits := '27' || substr(v_digits, 2); end if;

  -- Same number within a day: return the existing request instead of a duplicate.
  select id into v_id from signup_requests
  where whatsapp = '+' || v_digits and created_at > now() - interval '1 day'
  order by created_at desc limit 1;
  if v_id is not null then return v_id; end if;

  insert into signup_requests (name, whatsapp, agency, wants, suburbs, budget, ref, source)
  values (
    left(trim(p_name), 120),
    '+' || v_digits,
    left(trim(coalesce(p_agency, '')), 160),
    coalesce((select array_agg(left(w, 40)) from unnest(p_wants[1:6]) w), '{}'),
    left(trim(coalesce(p_suburbs, '')), 400),
    left(trim(coalesce(p_budget, '')), 40),
    left(p_ref, 120),
    case when p_source in ('lead_page', 'thank_you') then p_source else null end
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.request_signup(text, text, text, text[], text, text, text, text) from public;
grant execute on function public.request_signup(text, text, text, text[], text, text, text, text) to anon, authenticated;

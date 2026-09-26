-- Sign-up requests v2: email + city, and an alert to the admin on every new
-- request. Add-only columns and trigger. request_signup gets the two new
-- fields; the old 8-argument version is dropped (only the unreleased /start
-- page ever called it).

alter table public.signup_requests add column if not exists email text not null default '';
alter table public.signup_requests add column if not exists city text not null default '';
-- Set by the notify-signup function once the admin has been told, so an alert
-- never goes out twice.
alter table public.signup_requests add column if not exists notified_at timestamptz;

drop function if exists public.request_signup(text, text, text, text[], text, text, text, text);

create or replace function public.request_signup(
  p_name text,
  p_whatsapp text,
  p_email text,
  p_agency text,
  p_wants text[],
  p_city text,
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
  v_email text := lower(trim(coalesce(p_email, '')));
  v_id uuid;
begin
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'name_required'; end if;
  if length(v_digits) < 9 or length(v_digits) > 15 then raise exception 'phone_invalid'; end if;
  if v_email <> '' and v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then raise exception 'email_invalid'; end if;
  if v_digits ~ '^0\d{9}$' then v_digits := '27' || substr(v_digits, 2); end if;

  -- Same number within a day: return the existing request instead of a duplicate.
  select id into v_id from signup_requests
  where whatsapp = '+' || v_digits and created_at > now() - interval '1 day'
  order by created_at desc limit 1;
  if v_id is not null then return v_id; end if;

  insert into signup_requests (name, whatsapp, email, agency, wants, city, suburbs, budget, ref, source)
  values (
    left(trim(p_name), 120),
    '+' || v_digits,
    left(v_email, 160),
    left(trim(coalesce(p_agency, '')), 160),
    coalesce((select array_agg(left(w, 40)) from unnest(p_wants[1:6]) w), '{}'),
    left(trim(coalesce(p_city, '')), 80),
    left(trim(coalesce(p_suburbs, '')), 400),
    left(trim(coalesce(p_budget, '')), 40),
    left(p_ref, 120),
    case when p_source in ('lead_page', 'thank_you') then p_source else null end
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.request_signup(text, text, text, text, text[], text, text, text, text, text) from public;
grant execute on function public.request_signup(text, text, text, text, text[], text, text, text, text, text) to anon, authenticated;

-- Tell the admin (WhatsApp + Discord) about each new request. Fire-and-forget:
-- pg_net queues the call, so a slow or failed alert never blocks the insert.
create or replace function public.notify_signup_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url := 'https://yfcnsvrhojpysrzqrkdi.supabase.co/functions/v1/notify-signup',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object('id', new.id)
  );
  return new;
end;
$$;

revoke all on function public.notify_signup_request() from public, anon, authenticated;

drop trigger if exists signup_requests_notify on public.signup_requests;
create trigger signup_requests_notify
  after insert on public.signup_requests
  for each row execute function public.notify_signup_request();

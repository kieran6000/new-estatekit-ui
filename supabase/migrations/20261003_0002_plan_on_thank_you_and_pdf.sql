-- Marketing plan on the thank-you page, and an optional branded PDF per agent.
--
-- 1. agent_profiles.plan_pdf_url / plan_pdf_name: a PDF an operator uploads
--    for an agent (their own branded marketing plan). The plan page shows a
--    download button when there is one. Stored in the public "plan-pdfs"
--    bucket; only operators can upload, replace or remove files.
-- 2. open_selling_plan(token, from): what the plan page now calls. `from`
--    says where the link was opened ('thanks' = the thank-you page, anything
--    else = the email, which is all links had before). get_selling_plan(token)
--    is left as it was for any page still loaded from before this change. The first open from each place goes in the lead's
--    history, so an open from the email still counts after the seller has
--    already looked at it on the thank-you page.
-- 3. plan_pdf_opened(token): the first PDF download goes in the history too.

alter table public.lead_events drop constraint if exists lead_events_event_type_check;
alter table public.lead_events add constraint lead_events_event_type_check check (event_type = any (array[
  'created', 'stage_changed', 'note_changed', 'archived', 'restored', 'pipeline_moved', 'call', 'whatsapp_sent',
  'email_sent', 'email_failed', 'email_delivered', 'email_delayed', 'email_bounced', 'email_complained',
  'email_opened', 'email_clicked', 'plan_opened', 'plan_pdf_opened'
]));

alter table public.agent_profiles
  add column if not exists plan_pdf_url text,
  add column if not exists plan_pdf_name text;

alter table public.agent_profiles drop constraint if exists agent_profiles_plan_pdf_url_https;
alter table public.agent_profiles
  add constraint agent_profiles_plan_pdf_url_https check (plan_pdf_url is null or plan_pdf_url ~ '^https://');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('plan-pdfs', 'plan-pdfs', true, 20971520, array['application/pdf'])
on conflict (id) do update set public = true, file_size_limit = 20971520, allowed_mime_types = array['application/pdf'];

drop policy if exists "Operators upload plan PDFs" on storage.objects;
create policy "Operators upload plan PDFs" on storage.objects for insert to authenticated
  with check (bucket_id = 'plan-pdfs' and public.is_operator());
drop policy if exists "Operators replace plan PDFs" on storage.objects;
create policy "Operators replace plan PDFs" on storage.objects for update to authenticated
  using (bucket_id = 'plan-pdfs' and public.is_operator());
drop policy if exists "Operators list plan PDFs" on storage.objects;
create policy "Operators list plan PDFs" on storage.objects for select to authenticated
  using (bucket_id = 'plan-pdfs' and public.is_operator());
drop policy if exists "Operators remove plan PDFs" on storage.objects;
create policy "Operators remove plan PDFs" on storage.objects for delete to authenticated
  using (bucket_id = 'plan-pdfs' and public.is_operator());

create or replace function public.open_selling_plan(p_token text, p_from text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  l record;
  a record;
  pg record;
  v_reason text;
  v_timeline text;
  v_address text;
  v_sales jsonb;
  v_src text := case when p_from = 'thanks' then 'thank_you' else 'email' end;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{32}$' then return null; end if;

  select id, name, agent_id, source_page_id, form_answers, created_at into l
  from leads where plan_token = p_token;
  if l.id is null then return null; end if;

  select display_name, company, email, whatsapp_number, avatar_url, plan_pdf_url, plan_pdf_name into a
  from agent_profiles where agent_id = l.agent_id;
  select accent_color, slug, phone into pg from lead_pages where id = l.source_page_id;

  select
    max(case when classify_form_question(e->>'q') = 'reason' then normalize_form_answer(e->>'a') end),
    max(case when classify_form_question(e->>'q') = 'timeline' then normalize_form_answer(e->>'a') end),
    max(case when classify_form_question(e->>'q') = 'address' then e->>'a' end)
  into v_reason, v_timeline, v_address
  from jsonb_array_elements(case when jsonb_typeof(l.form_answers) = 'array' then l.form_answers else '[]'::jsonb end) e;

  select coalesce(jsonb_agg(jsonb_build_object('address', s.address, 'price', s.price, 'status', s.status, 'image_url', s.image_url) order by s.sort_order), '[]'::jsonb)
  into v_sales
  from (select * from sold_listings where agent_id = l.agent_id order by sort_order limit 6) s;

  -- First open from each place goes in the history. Opens logged before this
  -- change have no from_value; they all came from the email.
  if not exists (
    select 1 from lead_events
    where lead_id = l.id and event_type = 'plan_opened' and coalesce(from_value, 'email') = v_src
  ) then
    insert into lead_events (lead_id, agent_id, event_type, from_value, to_value, source)
    values (
      l.id, l.agent_id, 'plan_opened', v_src,
      case when v_src = 'thank_you' then 'Opened their selling plan on the thank-you page' else 'Opened their selling plan from the email' end,
      'automation'
    );
  end if;

  return jsonb_build_object(
    'lead_id', l.id,
    'lead_name', split_part(btrim(l.name), ' ', 1),
    'address', left(coalesce(v_address, ''), 160),
    'reason', coalesce(v_reason, ''),
    'timeline', coalesce(v_timeline, ''),
    'date', to_char(l.created_at at time zone 'Africa/Johannesburg', 'DD Mon YYYY'),
    'agent_name', coalesce(a.display_name, ''),
    'company', coalesce(a.company, ''),
    'agent_email', coalesce(a.email, ''),
    'agent_phone', coalesce(nullif(a.whatsapp_number, ''), pg.phone, ''),
    'photo', case when a.avatar_url ~ '^https://' then a.avatar_url else null end,
    'accent', coalesce(pg.accent_color, '#1976d2'),
    'page_slug', pg.slug,
    'sales', v_sales,
    'pdf_url', a.plan_pdf_url,
    'pdf_name', a.plan_pdf_name
  );
end;
$$;
revoke all on function public.open_selling_plan(text, text) from public;
grant execute on function public.open_selling_plan(text, text) to anon, authenticated;

create or replace function public.get_sample_selling_plan(p_agent uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  a record;
  pg record;
  v_sales jsonb;
begin
  -- coalesce: with no login, auth.uid() is null and the check must say no.
  if p_agent is null or not (coalesce(p_agent = auth.uid(), false) or coalesce(is_operator(), false)) then
    return null;
  end if;

  select display_name, company, email, whatsapp_number, avatar_url, plan_pdf_url, plan_pdf_name into a
  from agent_profiles where agent_id = p_agent;
  if not found then return null; end if;

  -- Their newest lead page, for the accent colour and phone.
  select accent_color, slug, phone into pg
  from lead_pages where agent_id = p_agent order by created_at desc limit 1;

  select coalesce(jsonb_agg(jsonb_build_object('address', s.address, 'price', s.price, 'status', s.status, 'image_url', s.image_url) order by s.sort_order), '[]'::jsonb)
  into v_sales
  from (select * from sold_listings where agent_id = p_agent order by sort_order limit 6) s;

  return jsonb_build_object(
    'lead_id', '00000000-0000-0000-0000-000000000000',
    'lead_name', 'Thandi',
    'address', '14 Loop Street, Centurion',
    'reason', 'Downsizing',
    'timeline', '1 – 3 months',
    'date', to_char(now() at time zone 'Africa/Johannesburg', 'DD Mon YYYY'),
    'agent_name', coalesce(a.display_name, ''),
    'company', coalesce(a.company, ''),
    'agent_email', coalesce(a.email, ''),
    'agent_phone', coalesce(nullif(a.whatsapp_number, ''), pg.phone, ''),
    'photo', case when a.avatar_url ~ '^https://' then a.avatar_url else null end,
    'accent', coalesce(pg.accent_color, '#1976d2'),
    'page_slug', pg.slug,
    'sales', v_sales,
    'pdf_url', a.plan_pdf_url,
    'pdf_name', a.plan_pdf_name
  );
end;
$$;

create or replace function public.plan_pdf_opened(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  l record;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{32}$' then return; end if;
  select id, agent_id into l from leads where plan_token = p_token;
  if l.id is null then return; end if;
  if not exists (select 1 from lead_events where lead_id = l.id and event_type = 'plan_pdf_opened') then
    insert into lead_events (lead_id, agent_id, event_type, to_value, source)
    values (l.id, l.agent_id, 'plan_pdf_opened', 'Opened the full marketing plan (PDF)', 'automation');
  end if;
end;
$$;
revoke all on function public.plan_pdf_opened(text) from public;
grant execute on function public.plan_pdf_opened(text) to anon, authenticated;

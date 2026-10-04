-- Lead magnets: one simple setup per form (lead page or Facebook form).
--
-- lead_pages.magnet_kind  'plan' = the personal marketing plan (sellers),
--                         'pdf'  = an uploaded PDF (a guide, a checklist...),
--                         'none' = nothing, null = automatic (the plan for
--                         seller forms, nothing otherwise: what happened before).
-- magnet_title / magnet_text / magnet_button: the words on the thank-you
-- page card and in the confirmation email's box (blank = the preset's words).
--
-- Every lead magnet opens through the same link, /plan/<token>: the plan
-- page shows the plan, or sends a PDF lead straight to the PDF. So opens are
-- logged the same way and the "Lead opens their lead magnet" trigger works
-- for both.
alter table public.lead_pages
  add column if not exists magnet_kind text check (magnet_kind in ('none', 'plan', 'pdf')),
  add column if not exists magnet_title text,
  add column if not exists magnet_text text,
  add column if not exists magnet_button text,
  add column if not exists magnet_pdf_url text check (magnet_pdf_url is null or magnet_pdf_url ~ '^https://');

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
  v_kind text;
  v_title text;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{32}$' then return null; end if;

  select id, name, agent_id, source_page_id, form_answers, created_at into l
  from leads where plan_token = p_token;
  if l.id is null then return null; end if;

  select display_name, company, email, whatsapp_number, avatar_url into a
  from agent_profiles where agent_id = l.agent_id;
  select accent_color, slug, phone, magnet_kind, magnet_title, magnet_pdf_url into pg from lead_pages where id = l.source_page_id;

  -- A PDF when the form has one; the plan otherwise (old links included).
  v_kind := case when pg.magnet_kind = 'pdf' and pg.magnet_pdf_url is not null then 'pdf' else 'plan' end;
  v_title := coalesce(nullif(btrim(pg.magnet_title), ''), case when v_kind = 'pdf' then 'their guide' else 'their marketing plan' end);

  if not exists (
    select 1 from lead_events
    where lead_id = l.id and event_type = 'plan_opened' and coalesce(from_value, 'email') = v_src
  ) then
    insert into lead_events (lead_id, agent_id, event_type, from_value, to_value, source)
    values (
      l.id, l.agent_id, 'plan_opened', v_src,
      'Opened ' || v_title || case when v_src = 'thank_you' then ' on the thank-you page' else ' from the email' end,
      'automation'
    );
  end if;

  if v_kind = 'pdf' then
    return jsonb_build_object('lead_id', l.id, 'kind', 'pdf', 'pdf_url', pg.magnet_pdf_url, 'title', v_title,
      'agent_name', coalesce(a.display_name, ''), 'accent', coalesce(pg.accent_color, '#1976d2'));
  end if;

  select
    max(case when classify_form_question(e->>'q') = 'reason' then normalize_form_answer(e->>'a') end),
    max(case when classify_form_question(e->>'q') = 'timeline' then normalize_form_answer(e->>'a') end),
    max(case when classify_form_question(e->>'q') = 'address' then e->>'a' end)
  into v_reason, v_timeline, v_address
  from jsonb_array_elements(case when jsonb_typeof(l.form_answers) = 'array' then l.form_answers else '[]'::jsonb end) e;

  select coalesce(jsonb_agg(jsonb_build_object('address', s.address, 'price', s.price, 'status', s.status, 'image_url', s.image_url) order by s.sort_order), '[]'::jsonb)
  into v_sales
  from (select * from sold_listings where agent_id = l.agent_id order by sort_order limit 6) s;

  return jsonb_build_object(
    'kind', 'plan',
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
    'sales', v_sales
  );
end;
$$;
revoke all on function public.open_selling_plan(text, text) from public;
grant execute on function public.open_selling_plan(text, text) to anon, authenticated;

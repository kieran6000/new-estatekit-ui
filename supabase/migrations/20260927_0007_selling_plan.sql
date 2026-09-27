-- Personal "Selling Plan" page linked from the confirmation email. Add-only.
--
-- leads.plan_token: a random 32-hex token minted when the email is sent. The
-- plan shows the lead's name and address, so it is only reachable with this
-- exact token (like the WhatsApp action links), never by lead id.
-- get_selling_plan(token): the one public read. Returns only what the page
-- shows, and records the first open in the lead's history (plan_opened).

alter table public.leads add column if not exists plan_token text;
create unique index if not exists leads_plan_token_idx on public.leads (plan_token) where plan_token is not null;

alter table public.lead_events drop constraint if exists lead_events_event_type_check;
alter table public.lead_events add constraint lead_events_event_type_check check (
  event_type = any (array[
    'created', 'stage_changed', 'note_changed', 'archived', 'restored',
    'pipeline_moved', 'call', 'whatsapp_sent',
    'email_sent', 'email_failed',
    'email_delivered', 'email_delayed', 'email_bounced', 'email_complained', 'email_opened', 'email_clicked',
    'plan_opened'
  ])
);

create or replace function public.get_selling_plan(p_token text)
returns jsonb
language plpgsql
volatile
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
begin
  if p_token is null or p_token !~ '^[a-f0-9]{32}$' then return null; end if;

  select id, name, agent_id, source_page_id, form_answers, created_at into l
  from leads where plan_token = p_token;
  if l.id is null then return null; end if;

  select display_name, company, email, whatsapp_number, avatar_url into a
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

  -- First open only goes in the history.
  if not exists (select 1 from lead_events where lead_id = l.id and event_type = 'plan_opened') then
    insert into lead_events (lead_id, agent_id, event_type, to_value, source)
    values (l.id, l.agent_id, 'plan_opened', 'Opened their selling plan', 'automation');
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
    'sales', v_sales
  );
end;
$$;

revoke all on function public.get_selling_plan(text) from public;
grant execute on function public.get_selling_plan(text) to anon, authenticated;

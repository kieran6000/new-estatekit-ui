-- One lead per person: someone who fills in a form again (same phone number,
-- same account, in any format) comes back to their existing lead instead of
-- becoming a second one. Used by our own forms (public-submit-lead) and
-- Facebook instant forms (sync-fb-leads, fb-lead-webhook); not by anything
-- else. Add-only.
--
--  * merge_repeat_lead(...): finds their lead and, if there is one, marks it
--    "came back": re-opens it (archived, Lost or Invalid Number → New Lead),
--    keeps the newest answers (the old ones stay in its history), notes it in
--    the history ("resubmitted"), and returns its id. NULL = a new person.
--  * leads.came_back_at: when they last came back (the Leads list shows it).
--  * lead_plan_tokens: a lead's earlier private codes, so links from their
--    first visit keep working after a repeat visit gives them a new one.
--  * lead_fb_repeats: Facebook lead ids already folded into a lead, so the
--    5-minute sync never counts the same repeat twice.
--  * Workflows: a "Lead fills in a form again" trigger (came_back).

alter table public.leads add column if not exists came_back_at timestamptz;

create table if not exists public.lead_plan_tokens (
  token text primary key,
  lead_id uuid not null references public.leads(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.lead_plan_tokens enable row level security;
revoke all on public.lead_plan_tokens from anon, authenticated;

create table if not exists public.lead_fb_repeats (
  fb_lead_id text primary key,
  lead_id uuid not null references public.leads(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.lead_fb_repeats enable row level security;
revoke all on public.lead_fb_repeats from anon, authenticated;

alter table public.lead_events drop constraint if exists lead_events_event_type_check;
alter table public.lead_events add constraint lead_events_event_type_check check (
  event_type = any (array[
    'created', 'stage_changed', 'note_changed', 'archived', 'restored', 'pipeline_moved', 'call', 'whatsapp_sent',
    'email_sent', 'email_failed', 'email_delivered', 'email_delayed', 'email_bounced', 'email_complained',
    'email_opened', 'email_clicked', 'plan_opened', 'plan_pdf_opened', 'workflow_email', 'workflow_email_opened',
    'tagged', 'email_unsubscribed', 'capi_reported', 'call_time_set',
    'resubmitted'
  ])
);

-- "082 555 0199", "+27 82 555 0199" and "27825550199" are one number.
create or replace function public.norm_phone(p text)
returns text
language sql
immutable
set search_path = public
as $$
  select case when d ~ '^0[0-9]{9}$' then '27' || substr(d, 2) else d end
  from (select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') as d) x;
$$;

-- The lead a private code belongs to: its current code, or an earlier one.
create or replace function public.lead_for_plan_token(p_token text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select id from leads where plan_token = p_token),
    (select lead_id from lead_plan_tokens where token = p_token)
  );
$$;
revoke all on function public.lead_for_plan_token(text) from public, anon, authenticated;

create or replace function public.merge_repeat_lead(
  p_agent uuid,
  p_phone text,
  p_name text,
  p_email text,
  p_answers jsonb,
  p_source text,
  p_plan_token text default null,
  p_fb_lead_id text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  l public.leads;
  v text := norm_phone(p_phone);
  v_answers text;
  v_reopen boolean;
  v_id uuid;
begin
  -- A Facebook lead we've already handled (the sync asks again for a week).
  if p_fb_lead_id is not null then
    select * into l from leads where fb_lead_id = p_fb_lead_id;
    if l.id is not null then return l.id; end if;
    select r.lead_id into v_id from lead_fb_repeats r where r.fb_lead_id = p_fb_lead_id;
    if v_id is not null then return v_id; end if;
  end if;
  if length(v) < 9 then return null; end if;

  select * into l from leads
   where agent_id = p_agent and norm_phone(phone) = v
   order by archived asc, created_at desc
   limit 1;
  if l.id is null then return null; end if;

  if p_fb_lead_id is not null then
    insert into lead_fb_repeats (fb_lead_id, lead_id) values (p_fb_lead_id, l.id) on conflict do nothing;
  end if;

  -- The same submission sent twice within a few minutes: nothing new.
  if l.created_at > now() - interval '10 minutes' and coalesce(l.came_back_at, l.created_at) > now() - interval '10 minutes' then
    return l.id;
  end if;

  v_reopen := l.archived or l.stage in ('Lost', 'Invalid Number');
  update leads set
    archived = false,
    stage = case when l.stage in ('Lost', 'Invalid Number') then 'New Lead' else stage end,
    next_label = case when v_reopen or l.stage in ('New Lead', 'No Answer') then 'Came back' else next_label end,
    due = case when v_reopen or l.stage in ('New Lead', 'No Answer') then true else due end,
    form_answers = case when jsonb_typeof(p_answers) = 'array' and jsonb_array_length(p_answers) > 0 then p_answers else form_answers end,
    email = coalesce(nullif(btrim(email), ''), nullif(btrim(p_email), '')),
    plan_token = coalesce(p_plan_token, plan_token),
    came_back_at = now()
  where id = l.id;

  -- Their earlier code keeps working.
  if p_plan_token is not null and l.plan_token is not null and l.plan_token <> p_plan_token then
    insert into lead_plan_tokens (token, lead_id) values (l.plan_token, l.id) on conflict do nothing;
  end if;

  select string_agg(coalesce(e->>'q', '') || ': ' || coalesce(e->>'a', ''), E'\n') into v_answers
    from jsonb_array_elements(case when jsonb_typeof(p_answers) = 'array' then p_answers else '[]'::jsonb end) e
   where coalesce(e->>'a', '') <> '';
  insert into lead_events (lead_id, agent_id, event_type, from_value, to_value, source)
  values (
    l.id, l.agent_id, 'resubmitted',
    case when lower(btrim(coalesce(p_name, ''))) <> lower(btrim(l.name)) and btrim(coalesce(p_name, '')) <> '' then btrim(p_name) end,
    left(coalesce(v_answers, ''), 1000),
    coalesce(p_source, 'website')
  );
  return l.id;
end;
$$;
revoke all on function public.merge_repeat_lead(uuid, text, text, text, jsonb, text, text, text) from public, anon, authenticated;

-- "Lead fills in a form again" starts workflows.
CREATE OR REPLACE FUNCTION public.enqueue_workflows_on_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  wf public.workflows;
  l public.leads;
begin
  if new.event_type not in ('plan_opened', 'resubmitted') then return new; end if;
  select * into l from leads where id = new.lead_id;
  if l.id is null or l.archived then return new; end if;
  if new.event_type = 'resubmitted' then
    -- "Lead fills in a form again": once for each time they do.
    for wf in select * from workflows where agent_id = l.agent_id and published and trigger_kind = 'came_back' loop
      perform enroll_workflow(wf, l, 'again-' || new.id);
    end loop;
    return new;
  end if;
  for wf in select * from workflows where agent_id = l.agent_id and published and trigger_kind = 'plan_opened' loop
    perform enroll_workflow(wf, l, 'plan-' || coalesce(new.from_value, 'email'));
  end loop;
  return new;
exception when others then
  return new;
end;
$function$;

-- The four lookups by private code also accept a lead's earlier codes.
CREATE OR REPLACE FUNCTION public.get_selling_plan(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  from leads where id = lead_for_plan_token(p_token);
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
$function$;

CREATE OR REPLACE FUNCTION public.open_selling_plan(p_token text, p_from text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  from leads where id = lead_for_plan_token(p_token);
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
$function$;

CREATE OR REPLACE FUNCTION public.plan_pdf_opened(p_token text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  l record;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{32}$' then return; end if;
  select id, agent_id into l from leads where id = lead_for_plan_token(p_token);
  if l.id is null then return; end if;
  if not exists (select 1 from lead_events where lead_id = l.id and event_type = 'plan_pdf_opened') then
    insert into lead_events (lead_id, agent_id, event_type, to_value, source)
    values (l.id, l.agent_id, 'plan_pdf_opened', 'Opened the full marketing plan (PDF)', 'automation');
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_call_time(p_token text, p_value text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  l record;
  v text := btrim(coalesce(p_value, ''));
  q constant text := 'When suits you for a quick call?';
  answers jsonb;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{32}$' then return false; end if;
  -- e.g. "Fri 17 Oct, around 10:00"
  if length(v) < 8 or length(v) > 60 or v !~ ', around [0-2][0-9]:[0-5][0-9]$' then return false; end if;

  select id, agent_id, form_answers into l from leads where id = lead_for_plan_token(p_token);
  if l.id is null then return false; end if;

  -- Replace an earlier answer to the same question (they changed their mind).
  select coalesce(jsonb_agg(e), '[]'::jsonb) into answers
  from jsonb_array_elements(case when jsonb_typeof(l.form_answers) = 'array' then l.form_answers else '[]'::jsonb end) e
  where e->>'q' is distinct from q;
  update leads set form_answers = answers || jsonb_build_array(jsonb_build_object('q', q, 'a', v)) where id = l.id;

  insert into lead_events (lead_id, agent_id, event_type, to_value, source)
  values (l.id, l.agent_id, 'call_time_set', v, 'website');
  return true;
end;
$function$;

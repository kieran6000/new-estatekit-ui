-- Locking in the seller form types. Add-only: two nullable columns, two pure
-- functions and one read-only view. Nothing existing changes.

-- An address question can require a street number (Higher intent). Browsers
-- type a suburb; real sellers type their address.
alter table public.custom_questions add column if not exists validation text
  check (validation is null or validation in ('street_number'));

-- Which version of the form type the page was built from, so pages on an old
-- version can be told apart (and moved deliberately, never silently).
alter table public.lead_pages add column if not exists preset_version integer;

-- One answer, one spelling, for reporting across every client.
-- "6-12_months", "6 - 12 Months" and "6 – 12 months" all become
-- "6 – 12 months"; "not_sure_yet" becomes "Not sure yet"; "immediately"
-- becomes "As soon as possible". The saved leads are never rewritten.
create or replace function public.normalize_form_answer(a text)
returns text
language sql
immutable
set search_path = public
as $$
  with s as (
    select btrim(regexp_replace(regexp_replace(replace(lower(coalesce(a, '')), '_', ' '), '\s*[-–—]\s*', ' – ', 'g'), '\s+', ' ', 'g')) v
  ), m as (
    select case v
      when 'immediately' then 'as soon as possible'
      when 'asap' then 'as soon as possible'
      else v end v
    from s
  )
  select case when v = '' then '' else upper(left(v, 1)) || substr(v, 2) end from m;
$$;

-- Which standard question a (freely worded) question is, so the same
-- question asked five different ways reports as one.
create or replace function public.classify_form_question(q text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when q ~* 'listed with' then 'listed'
    when q ~* '(how soon|when .*sell|timeline|time ?frame)' then 'timeline'
    when q ~* '(reason|why .*sell|pushing you)' then 'reason'
    when q ~* 'address' then 'address'
    else 'other'
  end;
$$;

-- Every form answer as one row, with the standard question and the
-- standardised answer. security_invoker: it reads through the caller's own
-- access rules, so an agent sees only their leads and an operator sees all.
create or replace view public.lead_form_answers
with (security_invoker = true) as
select
  l.id as lead_id,
  l.agent_id,
  l.pipeline_id,
  l.source_page_id,
  lp.preset,
  lp.preset_version,
  l.stage,
  l.quality,
  l.created_at,
  e->>'q' as question,
  public.classify_form_question(e->>'q') as question_key,
  e->>'a' as answer_raw,
  -- Only multiple-choice answers are standardised; typed answers (addresses)
  -- are kept exactly as written.
  case when public.classify_form_question(e->>'q') in ('timeline', 'reason', 'listed')
    then public.normalize_form_answer(e->>'a') else e->>'a' end as answer
from public.leads l
left join public.lead_pages lp on lp.id = l.source_page_id
cross join lateral jsonb_array_elements(case when jsonb_typeof(l.form_answers) = 'array' then l.form_answers else '[]'::jsonb end) e
where not l.archived;

revoke all on public.lead_form_answers from anon;
grant select on public.lead_form_answers to authenticated;

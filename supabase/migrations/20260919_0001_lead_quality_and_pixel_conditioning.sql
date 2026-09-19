-- Lead quality: a middle tier between "good lead" and "reject".
--
-- disqualify_answers already ends the flow with no lead at all. But plenty of
-- answers aren't bad enough to turn away, yet shouldn't be taught to Meta as a
-- conversion — optimising toward them buys more of the same. These answers mark
-- a lead "weak": it still reaches the agent, it just doesn't fire the Facebook
-- Lead event, and the visitor gets one extra confirmation step on the way out.

alter table public.custom_questions
  add column if not exists low_quality_answers text[] not null default '{}'::text[];

comment on column public.custom_questions.low_quality_answers is
  'Answers that still create a lead but mark it weak: no Facebook conversion event is fired, and the form adds a confirmation step. Distinct from disqualify_answers, which creates no lead at all.';

-- Stamped on the lead so the agent sees what they''re picking up, and so the
-- Overview can tell volume from quality.
alter table public.leads
  add column if not exists quality text not null default 'good';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'leads_quality_check'
  ) then
    alter table public.leads
      add constraint leads_quality_check check (quality in ('good', 'weak'));
  end if;
end $$;

comment on column public.leads.quality is
  'good | weak. "weak" means the visitor picked an answer flagged in custom_questions.low_quality_answers; no Facebook conversion event was reported for it.';

create index if not exists leads_quality_idx on public.leads (quality) where quality <> 'good';

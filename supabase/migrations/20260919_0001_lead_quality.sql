-- Answers that shouldn't be counted as conversions.
--
-- There are exactly three things an answer can do, and two already existed:
-- carry on (default), or stop with no lead (disqualify_answers). This adds the
-- missing middle one — take the lead, but don't tell Facebook.
--
-- That middle case is the only genuinely new capability: plenty of answers
-- aren't bad enough to turn someone away, yet reporting them as conversions
-- teaches the pixel to go and find more of exactly the lead the agent doesn't
-- want. One text[] column covers it.

alter table public.custom_questions
  add column if not exists low_quality_answers text[] not null default '{}'::text[];

comment on column public.custom_questions.low_quality_answers is
  'Answers that still create a lead but are not reported to Facebook as a conversion. Distinct from disqualify_answers, which creates no lead at all.';

-- Stamped on the lead so the agent can see what they picked up, and so the
-- Conversions API refuses to report it server-side even if something retries.
alter table public.leads
  add column if not exists quality text not null default 'good';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'leads_quality_check') then
    alter table public.leads
      add constraint leads_quality_check check (quality in ('good', 'weak'));
  end if;
end $$;

comment on column public.leads.quality is
  'good | weak. "weak" means an answer was flagged in custom_questions.low_quality_answers: a real lead the agent wanted, deliberately not reported to Facebook.';

create index if not exists leads_quality_idx on public.leads (quality) where quality <> 'good';

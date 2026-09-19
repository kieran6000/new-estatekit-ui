-- Answer routing: "if they pick this, go there."
--
-- One setting per answer, and the *behaviour* lives on the destination rather
-- than on the answer. That's the whole trick to keeping this simple: an answer
-- only ever says where to go; whether it becomes a lead, and whether Facebook
-- is told, is decided once on the end page it lands on.
--
-- Route values are plain strings so there's nothing to parse or nest:
--   (absent) / 'next'   carry on to the next question
--   'q:<question_id>'   jump to that question (skipping the ones between)
--   'end:thanks'        the page's normal thank-you
--   'end:not_a_fit'     the built-in polite "not a fit" goodbye
--   'end:<ending_id>'   a custom end page (see lead_page_endings)

alter table public.custom_questions
  add column if not exists answer_routes jsonb not null default '{}'::jsonb;

comment on column public.custom_questions.answer_routes is
  'Answer text -> destination. Values: next | q:<question_id> | end:thanks | end:not_a_fit | end:<ending_id>. Absent means carry on.';

-- Custom end pages. The two built-ins ('thanks' and 'not_a_fit') are not rows:
-- they always exist for every page, so nothing needs seeding and existing pages
-- keep working untouched.
create table if not exists public.lead_page_endings (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.lead_pages(id) on delete cascade,
  agent_id uuid not null,
  name text not null default 'End page',
  headline text not null default 'Thanks!',
  subtext text not null default '',
  -- What this ending *is*, in one value, rather than a pile of booleans:
  --   lead          a real lead; reported to Facebook as a conversion
  --   quiet_lead    a real lead, but NOT reported to Facebook. For answers worth
  --                 following up yet not worth teaching the pixel to find more of
  --   no_lead       not a lead at all; a polite goodbye
  outcome text not null default 'lead',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint lead_page_endings_outcome_check
    check (outcome in ('lead', 'quiet_lead', 'no_lead'))
);

alter table public.lead_page_endings enable row level security;

-- Public pages must render their end pages without a session, same as
-- lead_pages and custom_questions already do.
create policy "Anyone can read lead page endings"
  on public.lead_page_endings for select using (true);

create policy "Agents manage own endings"
  on public.lead_page_endings for all
  using (agent_id = auth.uid() or is_operator())
  with check (agent_id = auth.uid() or is_operator());

create index if not exists lead_page_endings_page_idx
  on public.lead_page_endings (page_id, sort_order);

-- Stamped on the lead so the agent can see what they're picking up, and so a
-- 'quiet_lead' is never reported to Meta even if something retries.
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
  'good | weak. "weak" comes from an end page with outcome = quiet_lead: a real lead the agent wanted, deliberately not reported to Facebook as a conversion.';

create index if not exists leads_quality_idx on public.leads (quality) where quality <> 'good';

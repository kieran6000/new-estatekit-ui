-- Every client's seller (home value) landing page asks the same questions,
-- with the same answers and the same disqualifiers (Kieran, 29 Oct 2026):
--   1. What's your property address?            (street number required)
--   2. If your FREE home evaluation is good, how soon will you sell?
--        "Not planning to sell" disqualifies
--   3. What's the main reason you're thinking about selling?
--        "I just want to know what it's worth for now" disqualifies
-- The "Higher intent" form type, v3 (src/lib/formPresets.ts). Only the
-- questions change: headline, thank-you page, email field and the rest of
-- each page stay as they are. Leads already in keep their answers (they're
-- stored on the lead). Not touched: buyer and other pages, Facebook
-- instant forms, the Demo Agent's sales demos, deactivated accounts.
create temp table one_form_pages on commit drop as
select p.id, p.agent_id
  from public.lead_pages p
  join public.pipelines pl on pl.id = p.pipeline_id
  join public.agent_profiles a on a.agent_id = p.agent_id
 where pl.kind = 'seller'
   and coalesce(p.source_type, 'page') <> 'facebook'
   and a.deactivated_at is null
   and a.display_name <> 'Demo Agent';

delete from public.custom_questions q using one_form_pages t where q.page_id = t.id;

insert into public.custom_questions (page_id, agent_id, label, type, options, helper_text, required, is_default, sort_order, disqualify_answers, low_quality_answers, validation)
select t.id, t.agent_id, x.label, x.type, x.options, x.helper_text, true, false, x.sort_order, x.dq, '{}'::text[], x.validation
  from one_form_pages t
 cross join (values
   (0, 'What''s your property address?', 'address', null::jsonb, 'e.g. 14 Loop Street, Midrand', '{}'::text[], 'street_number'),
   (1, 'If your FREE home evaluation is good, how soon will you sell?', 'multiple_choice',
       '["As soon as possible", "1 – 3 months", "3 – 6 months", "6 – 12 months", "Not sure yet", "Not planning to sell"]'::jsonb,
       null, '{"Not planning to sell"}'::text[], null),
   (2, 'What''s the main reason you''re thinking about selling?', 'multiple_choice',
       '["Relocating", "Emigrating", "Downsizing", "Upgrading", "Retirement", "Inherited property", "Financial reasons", "I just want to know what it''s worth for now"]'::jsonb,
       null, '{"I just want to know what it''s worth for now"}'::text[], null)
 ) as x(sort_order, label, type, options, helper_text, dq, validation);

update public.lead_pages p set preset = 'best_quality', preset_version = 3 from one_form_pages t where p.id = t.id;

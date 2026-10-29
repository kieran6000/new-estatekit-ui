-- Shoaib, Chantal and Ansunette are happy with "I just want to know what
-- it's worth for now" leads, so they count as normal leads (reported to
-- Facebook like any other), not weak ones (replaces that part of 20261029_0009).
update public.custom_questions q
   set disqualify_answers = '{}'::text[],
       low_quality_answers = '{}'::text[]
  from public.lead_pages p
  join public.agent_profiles a on a.agent_id = p.agent_id
 where q.page_id = p.id
   and q.label = 'What''s the main reason you''re thinking about selling?'
   and (a.display_name, p.name) in (('Shoaib Kathrada', 'Home Value'), ('Chantal Hoole', 'Home Value'), ('Ansunette Ferreira', 'ansunette-cma'));

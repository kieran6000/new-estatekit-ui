-- Exceptions to the one seller form (20261029_0007), per Kieran:
-- Mpho also asks "Are you Selling or Renting" (as her page did before),
-- right after the address. Not required, nobody is disqualified by it.
update public.custom_questions q
   set sort_order = q.sort_order + 1
  from public.lead_pages p
  join public.agent_profiles a on a.agent_id = p.agent_id
 where q.page_id = p.id and a.display_name = 'Mphokuhle Siziba' and p.name = 'Seller campaign (13/10/2026)'
   and q.sort_order >= 1
   and not exists (select 1 from public.custom_questions x where x.page_id = p.id and x.label = 'Are you Selling or Renting');

insert into public.custom_questions (page_id, agent_id, label, type, options, required, is_default, sort_order, disqualify_answers, low_quality_answers)
select p.id, p.agent_id, 'Are you Selling or Renting', 'multiple_choice', '["Selling", "Renting"]'::jsonb, false, false, 1, '{}'::text[], '{}'::text[]
  from public.lead_pages p
  join public.agent_profiles a on a.agent_id = p.agent_id
 where a.display_name = 'Mphokuhle Siziba' and p.name = 'Seller campaign (13/10/2026)'
   and not exists (select 1 from public.custom_questions x where x.page_id = p.id and x.label = 'Are you Selling or Renting');

-- Shoaib, Chantal and Ansunette: "just want to know what it's worth" is a
-- weak lead again, not disqualified. It still reaches the agent; it just
-- isn't reported to Facebook as a lead.
update public.custom_questions q
   set disqualify_answers = '{}'::text[],
       low_quality_answers = '{"I just want to know what it''s worth for now"}'::text[]
  from public.lead_pages p
  join public.agent_profiles a on a.agent_id = p.agent_id
 where q.page_id = p.id
   and q.label = 'What''s the main reason you''re thinking about selling?'
   and (a.display_name, p.name) in (('Shoaib Kathrada', 'Home Value'), ('Chantal Hoole', 'Home Value'), ('Ansunette Ferreira', 'ansunette-cma'));

-- The standard "Came back — tell the agent" workflow (KEEP IN STEP with
-- TEMPLATES in src/lib/workflow.ts), then every account's copy, switched on.
-- Someone already in the agent's leads fills in a form again: a WhatsApp
-- straight away (like a new-lead alert) and a reminder to call today.
insert into public.workflows (agent_id, is_template, name, published, standard, standard_on, definition)
select null, true, 'Came back — tell the agent', false, true, true, jsonb_build_object(
  'trigger', '{"kind":"came_back"}'::jsonb,
  'filters', '[]'::jsonb,
  'steps', jsonb_build_array(
    jsonb_build_object('id', 'mcbwa', 'type', 'whatsapp_agent', 'text', E'{{name}} filled in your form again just now. They''re keen: call them now.\n{{phone}}\n\nCall and log it: {{action_link}}'),
    jsonb_build_object('id', 'mcbrem', 'type', 'reminder', 'label', 'Call {{first_name}}: they came back', 'inDays', 0)),
  'exits', '[{"kind":"booked","on":false},{"kind":"lost","on":false},{"kind":"any_stage_change","on":false}]'::jsonb,
  'settings', '{"quietHours":false,"reEnter":true}'::jsonb)
where not exists (select 1 from public.workflows w where w.is_template and w.name = 'Came back — tell the agent');

select public.add_standard_workflows(agent_id) from public.agent_profiles;

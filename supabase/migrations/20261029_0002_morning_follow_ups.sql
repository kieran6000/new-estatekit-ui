-- One morning WhatsApp (weekdays 08:00) listing what to follow up today,
-- instead of a nudge per lead through the day (switched off in
-- 20261029_0001). On for every account. Needs run-automations with
-- {{follow_ups}} deployed first: an older engine would send the placeholder.
do $$
begin
  if exists (select 1 from public.workflows where is_template and standard and name = 'Daily — morning follow-up list') then return; end if;
  insert into public.workflows (agent_id, is_template, name, published, standard, standard_on, definition)
  values (null, true, 'Daily — morning follow-up list', false, true, true, jsonb_build_object(
    'trigger', '{"kind":"daily_at","time":"08:00"}'::jsonb,
    'filters', '[]'::jsonb,
    'steps', jsonb_build_array(jsonb_build_object('id', 'morningfollowups', 'type', 'whatsapp_agent',
      'text', E'Good morning {{first_name}}. Today you have {{count}} {{leads_word}} to follow up:\n\n{{follow_ups}}\n\nOpen your leads: https://leads.estatekit.co/leads')),
    'exits', '[{"kind":"booked","on":false},{"kind":"lost","on":false},{"kind":"any_stage_change","on":false}]'::jsonb,
    'settings', '{"quietHours":true,"reEnter":false}'::jsonb));
  perform public.add_standard_workflows(agent_id) from public.agent_profiles;
end $$;

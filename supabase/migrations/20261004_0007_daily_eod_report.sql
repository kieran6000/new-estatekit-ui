-- Standard workflow: an end-of-day WhatsApp to the agent (weekdays 17:00) with
-- today's activity, their pipeline by stage and how many new leads are still
-- uncalled. Off by default; switched on per account.
do $$
begin
  if exists (select 1 from public.workflows where is_template and standard and name = 'Daily — end-of-day report') then return; end if;
  insert into public.workflows (agent_id, is_template, name, published, standard, standard_on, definition)
  values (null, true, 'Daily — end-of-day report', false, true, false, jsonb_build_object(
    'trigger', '{"kind":"daily_at","time":"17:00"}'::jsonb,
    'filters', '[]'::jsonb,
    'steps', jsonb_build_array(jsonb_build_object('id', 'eodreport', 'type', 'whatsapp_agent',
      'text', E'Hi {{first_name}}, here''s your day.\n\n{{today}}\n\nYour pipeline right now:\n{{pipeline}}\n\n{{not_called}}\n\nUpdate your leads here: https://leads.estatekit.co/leads')),
    'exits', '[{"kind":"booked","on":false},{"kind":"lost","on":false},{"kind":"any_stage_change","on":false}]'::jsonb,
    'settings', '{"quietHours":true,"reEnter":false}'::jsonb));
  perform public.add_standard_workflows(agent_id) from public.agent_profiles;
end $$;

-- A chill no-show email sequence for EstateKit's OWN funnel (the agency
-- pipeline fed by estatekit.co/pitch). When a prospective agent is marked
-- "No-show", we send three relaxed, no-pressure emails spread over a week and a half, each
-- with a one-tap link back to the booking page, in Kieran's name.
--
-- Built as a normal published workflow on EstateKit's account so Kieran can
-- edit the copy on the dashboard (Automations -> Workflows) any time -- the
-- copy here is real, not a blank template.
--
-- It stops the moment the prospect acts: the moment they move off "No-show"
-- (e.g. rebook -> Booked) ANY stage change ends the sequence, so there are no
-- repeat emails once they're back on track; booking or being marked Lost also
-- ends it. reEnter is off, so a lead only ever gets the sequence once.
-- Emails go out in daytime only (quiet hours).
--
-- {{rebook_link}} is resolved by run-automations to the website's booking page
-- (www.estatekit.co/rebook) with the prospect's details pre-filled where known.
-- These are agency emails, so run-automations sends them as kieran@estatekit.co.
--
-- Add-only: one INSERT, guarded so re-running is a no-op.

-- trigger_kind is a GENERATED column (definition->'trigger'->>'kind'), so it
-- resolves to 'stage_changed' on its own and must not be set here.
-- enqueue_workflows() filters stage-change enrollment on it.
insert into public.workflows (agent_id, is_template, name, published, standard, standard_on, definition)
select
  'c5beabe6-e009-4880-8506-59383f053312'::uuid, false,
  'EK No-show — win the call back', true, false, false,
  jsonb_build_object(
    'trigger', jsonb_build_object('kind', 'stage_changed', 'stage', 'No-show'),
    'filters', '[]'::jsonb,
    'steps', jsonb_build_array(
      jsonb_build_object('id', 'nsw1', 'type', 'wait', 'amount', 2, 'unit', 'hours'),
      jsonb_build_object('id', 'nse2', 'type', 'email_lead',
        'subject', 'Sorry we missed each other, {{first_name}}',
        'body', E'Hi {{first_name}},\n\nLooks like we missed each other for your EstateKit call — no stress at all, these things happen.\n\nWhenever it suits you, grab a new time here and I''ll give you a call then:\n{{rebook_link}}\n\n{{agent_name}}'),
      jsonb_build_object('id', 'nsw3', 'type', 'wait', 'amount', 4, 'unit', 'days'),
      jsonb_build_object('id', 'nse4', 'type', 'email_lead',
        'subject', 'Still keen to see the seller attraction system, {{first_name}}?',
        'body', E'Hi {{first_name}},\n\nI''d still love to show you the seller attraction system — how EstateKit keeps a steady flow of sellers coming to you and handles the follow-up for you, so you list more without all the chasing.\n\nIt''s a quick, relaxed call, no pressure. Pick a time that suits you:\n{{rebook_link}}\n\n{{agent_name}}'),
      jsonb_build_object('id', 'nsw5', 'type', 'wait', 'amount', 7, 'unit', 'days'),
      jsonb_build_object('id', 'nse6', 'type', 'email_lead',
        'subject', 'Want me to leave it here, {{first_name}}?',
        'body', E'Hi {{first_name}},\n\nI haven''t managed to catch you on a call yet, so I''ll leave it there for now — no worries at all.\n\nIf you''d still like to see how the seller attraction system could keep your pipeline full of sellers, the door''s open. Just grab a time whenever you''re ready:\n{{rebook_link}}\n\nAll the best,\n{{agent_name}}')
    ),
    'exits', '[{"kind":"booked","on":true},{"kind":"lost","on":true},{"kind":"any_stage_change","on":true}]'::jsonb,
    'settings', '{"quietHours":true,"reEnter":false}'::jsonb
  )
where not exists (
  select 1 from public.workflows
   where agent_id = 'c5beabe6-e009-4880-8506-59383f053312'::uuid
     and name = 'EK No-show — win the call back'
);

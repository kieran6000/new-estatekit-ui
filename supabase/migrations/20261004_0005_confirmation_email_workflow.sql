-- The confirmation email becomes a workflow, like every other message.
--
-- Before: a per-account switch (agent_profiles.lead_confirmation_email) and
-- its own sender (send-lead-confirmation). Now: a standard workflow
-- "New lead — confirmation email" that emails each new lead with an email
-- address, with the form's lead magnet ({{lead_magnet}}) and a WhatsApp
-- link. Accounts that had the switch on get it switched on; the switch is
-- retired (the column stays, unused, so nothing reading it breaks).
--
-- Delivery reports: workflow emails now keep Resend's id, so the
-- resend-webhook can record delivered / bounced / spam on them too.

alter table public.workflow_emails add column if not exists resend_id text;
create index if not exists workflow_emails_resend_id on public.workflow_emails (resend_id) where resend_id is not null;

do $$
declare
  v_sign text := E'\n\n{{agent_name}}\n{{agent_phone}}';
  v_wa text := E'\n\nIf it''s easier, you can message me on WhatsApp here: {{whatsapp_link}}';
  v_tpl uuid;
begin
  if exists (select 1 from public.workflows where is_template and standard and name = 'New lead — confirmation email') then return; end if;

  insert into public.workflows (agent_id, is_template, name, published, standard, standard_on, definition)
  values (null, true, 'New lead — confirmation email', false, true, false, jsonb_build_object(
    'trigger', '{"kind":"lead_created"}'::jsonb,
    'filters', '[{"field":"has_email","value":"yes"}]'::jsonb,
    'steps', jsonb_build_array(jsonb_build_object(
      'id', 'cbseller', 'type', 'branch', 'check', 'pipeline_is', 'value', 'Sellers',
      'yes', jsonb_build_array(jsonb_build_object('id', 'cmseller', 'type', 'email_lead',
        'subject', 'Your home evaluation request',
        'body', E'Hi {{first_name}},\n\nThanks for requesting a free home evaluation for {{address}}. I''m working on it now.\n\n{{lead_magnet}}\n\nWhen your evaluation is ready, I''ll be in touch to go through what your home could be worth, and whether I have buyers looking in the area.' || v_wa || v_sign)),
      'no', jsonb_build_array(jsonb_build_object(
        'id', 'cbbuyer', 'type', 'branch', 'check', 'pipeline_is', 'value', 'Buyers',
        'yes', jsonb_build_array(jsonb_build_object('id', 'cmbuyer', 'type', 'email_lead',
          'subject', 'Your property search',
          'body', E'Hi {{first_name}},\n\nThanks for getting in touch about finding your next home.\n\nI''ve received your details and I''ll be in touch shortly.\n\n{{lead_magnet}}' || v_wa || v_sign)),
        'no', jsonb_build_array(jsonb_build_object('id', 'cmother', 'type', 'email_lead',
          'subject', 'We''ve received your details',
          'body', E'Hi {{first_name}},\n\nThanks for getting in touch.\n\nI''ve received your details and I''ll be in touch shortly.\n\n{{lead_magnet}}' || v_wa || v_sign))
      ))
    )),
    'exits', '[{"kind":"booked","on":false},{"kind":"lost","on":false},{"kind":"any_stage_change","on":false}]'::jsonb,
    'settings', '{"quietHours":false,"reEnter":false}'::jsonb
  ))
  returning id into v_tpl;

  -- Every account gets a copy (off); the ones that had the switch on get it on.
  perform public.add_standard_workflows(agent_id) from public.agent_profiles;
  update public.workflows w set published = true, updated_at = now()
    from public.agent_profiles p
   where w.from_template = v_tpl and w.agent_id = p.agent_id and p.lead_confirmation_email;
  update public.agent_profiles set lead_confirmation_email = false where lead_confirmation_email;
end $$;

-- The old sender no longer fires (the workflow sends instead).
create or replace function public.queue_lead_confirmation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Retired Oct 2026: the "New lead — confirmation email" workflow sends it.
  return new;
end;
$$;

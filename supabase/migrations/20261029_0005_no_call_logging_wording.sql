-- Not every agent logs calls in EstateKit, so no workflow message says "log
-- it" or assumes a call was logged. Standard templates and every account's
-- copy; Kieran's own EK workflows and test workflows are left alone. The
-- link itself ({{action_link}}) is unchanged: it opens the lead.
update public.workflows
   set definition = replace(replace(replace(replace(
         definition::text,
         'Call and log it: {{action_link}}', 'Open the lead: {{action_link}}'),
         'for your call, and it isn''t logged yet. Call now: {{action_link}}', 'for your call. If you haven''t called yet, call now: {{action_link}}'),
         'is signed up. Update: {{action_link}}', 'is signed up. Open the lead: {{action_link}}'),
         'go? Update: {{action_link}}', 'go? Open the lead: {{action_link}}')::jsonb,
       updated_at = now()
 where name in ('Came back — tell the agent', 'Call time picked — tell the agent', 'Call time — 15 minutes before',
                'Call time — missed call check', 'Mandate Signed — confirmation', 'Viewing Booked — how did it go?')
   and definition::text ~ '(Call and log it|isn''t logged yet|Update: \{\{action_link\}\})';

-- The dates under a lead's note, for an agent on their WhatsApp link (no login).
-- Add-only: one new function. Same check as get_shared_lead: a live link gets the
-- saved versions of that one lead's note, which the link can already read.
create or replace function public.get_shared_note_history(p_token text)
returns table (to_value text, created_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select e.to_value, e.created_at
  from lead_share_tokens t
  join leads l on l.id = t.lead_id and l.agent_id = t.agent_id
  join lead_events e on e.lead_id = l.id and e.event_type = 'note_changed'
  where t.token = p_token
    and t.expires_at > now();
$$;

revoke all on function public.get_shared_note_history(text) from public;
grant execute on function public.get_shared_note_history(text) to anon, authenticated, service_role;

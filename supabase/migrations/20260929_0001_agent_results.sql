-- get_agent_results(agent, days): one agent's lead results over the last N
-- days, in plain terms. Used by the agent's "My results" (Leads page) and by
-- the internal-client-feed function for the internal service dashboard, so
-- both show the same numbers.
--
-- leads        new leads in the period (not archived)
-- followed_up  leads they called or moved on from "New Lead" in the period
-- booked       leads moved to Booked / Viewing Booked in the period
-- mandates     leads moved to Mandate Signed in the period
-- waiting      right now: leads still on "New Lead" (never contacted)
-- no_answer    right now: leads on "No Answer" (to try again)
--
-- Only the agent themselves, an operator, or the service role (edge
-- functions) can read it. Add-only: a new function, nothing else changes.
create or replace function public.get_agent_results(p_agent uuid, p_days int default 7)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 7), 365)));
  v jsonb;
begin
  -- coalesce: with no login, auth.uid() is null and the check must say no.
  if p_agent is null or not (
    coalesce(p_agent = auth.uid(), false)
    or coalesce(is_operator(), false)
    or coalesce(auth.role() = 'service_role', false)
  ) then
    return null;
  end if;

  select jsonb_build_object(
    'days', extract(day from now() - v_since)::int,
    'leads', (select count(*) from leads l where l.agent_id = p_agent and not l.archived and l.created_at > v_since),
    'followed_up', (
      select count(distinct e.lead_id) from lead_events e
      where e.agent_id = p_agent and e.created_at > v_since
        and (e.event_type = 'call' or (e.event_type = 'stage_changed' and coalesce(e.to_value, '') <> 'New Lead'))
    ),
    'booked', (
      select count(distinct e.lead_id) from lead_events e
      where e.agent_id = p_agent and e.created_at > v_since
        and e.event_type = 'stage_changed' and e.to_value in ('Booked', 'Viewing Booked')
    ),
    'mandates', (
      select count(distinct e.lead_id) from lead_events e
      where e.agent_id = p_agent and e.created_at > v_since
        and e.event_type = 'stage_changed' and e.to_value = 'Mandate Signed'
    ),
    'waiting', (select count(*) from leads l where l.agent_id = p_agent and not l.archived and l.stage = 'New Lead'),
    'no_answer', (select count(*) from leads l where l.agent_id = p_agent and not l.archived and l.stage = 'No Answer')
  ) into v;
  return v;
end;
$$;
revoke all on function public.get_agent_results(uuid, int) from public;
grant execute on function public.get_agent_results(uuid, int) to authenticated, service_role;

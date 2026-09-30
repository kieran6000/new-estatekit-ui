-- Date-range versions of the account numbers, for the Accounts page's time
-- picker (last 7 days, this month, last month, a custom range…).
-- Add-only: two new functions; get_agent_results(agent, days) is unchanged.

-- Leads per account between two moments (operators only).
create or replace function public.operator_lead_counts(p_since timestamptz, p_until timestamptz)
returns table (agent_id uuid, leads bigint)
language sql
stable
security definer
set search_path = public
as $$
  select l.agent_id, count(*)
  from leads l
  where coalesce(is_operator(), false)
    and not l.archived
    and l.created_at >= p_since
    and l.created_at < p_until
  group by l.agent_id;
$$;
revoke all on function public.operator_lead_counts(timestamptz, timestamptz) from public;
grant execute on function public.operator_lead_counts(timestamptz, timestamptz) to authenticated;

-- One account's results between two moments. Same definitions as
-- get_agent_results; "waiting" and "no_answer" are always right now.
create or replace function public.get_agent_results_between(p_agent uuid, p_since timestamptz, p_until timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- coalesce: with no login, auth.uid() is null and the check must say no.
  if p_agent is null or p_since is null or p_until is null or not (
    coalesce(p_agent = auth.uid(), false)
    or coalesce(is_operator(), false)
    or coalesce(auth.role() = 'service_role', false)
  ) then
    return null;
  end if;

  return jsonb_build_object(
    'leads', (select count(*) from leads l where l.agent_id = p_agent and not l.archived and l.created_at >= p_since and l.created_at < p_until),
    'followed_up', (
      select count(distinct e.lead_id) from lead_events e
      where e.agent_id = p_agent and e.created_at >= p_since and e.created_at < p_until
        and (e.event_type = 'call' or (e.event_type = 'stage_changed' and coalesce(e.to_value, '') <> 'New Lead'))
    ),
    'booked', (
      select count(distinct e.lead_id) from lead_events e
      where e.agent_id = p_agent and e.created_at >= p_since and e.created_at < p_until
        and e.event_type = 'stage_changed' and e.to_value in ('Booked', 'Viewing Booked')
    ),
    'mandates', (
      select count(distinct e.lead_id) from lead_events e
      where e.agent_id = p_agent and e.created_at >= p_since and e.created_at < p_until
        and e.event_type = 'stage_changed' and e.to_value = 'Mandate Signed'
    ),
    'waiting', (select count(*) from leads l where l.agent_id = p_agent and not l.archived and l.stage = 'New Lead'),
    'no_answer', (select count(*) from leads l where l.agent_id = p_agent and not l.archived and l.stage = 'No Answer')
  );
end;
$$;
revoke all on function public.get_agent_results_between(uuid, timestamptz, timestamptz) from public;
grant execute on function public.get_agent_results_between(uuid, timestamptz, timestamptz) to authenticated, service_role;

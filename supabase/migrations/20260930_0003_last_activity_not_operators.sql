-- "Last active" must only reflect the agent, never an operator (Kieran:
-- "last active should not log anything I do"). Replaces today's
-- operator_last_activity (same signature):
--  * App use: the agent's own login sessions, except sessions that came from
--    an IP address an operator has used (i.e. an operator testing their login).
--  * Lead updates: done as the agent, except from a browser/device an operator
--    has used (older action-link events were credited to the agent even when
--    an operator opened the link; the functions now record the operator).
create or replace function public.operator_last_activity()
returns table (agent_id uuid, last_seen timestamptz, last_in_app timestamptz, last_lead_action timestamptz)
language sql
stable
security definer
set search_path = public, auth
as $$
  with ops as (
    select agent_id from public.agent_profiles where is_operator
  ),
  op_ips as (
    select distinct host(s.ip) ip from auth.sessions s join ops on ops.agent_id = s.user_id where s.ip is not null
  ),
  op_devices as (
    select distinct s.user_agent ua from auth.sessions s join ops on ops.agent_id = s.user_id where coalesce(s.user_agent, '') <> ''
    union
    select distinct e.device from public.lead_events e join ops on ops.agent_id = e.actor_id where coalesce(e.device, '') <> ''
  ),
  app as (
    select p.agent_id,
      (select max(greatest(s.created_at, coalesce(s.refreshed_at, s.created_at), coalesce(s.updated_at, s.created_at)))
         from auth.sessions s
        where s.user_id = p.agent_id
          and (s.ip is null or host(s.ip) not in (select ip from op_ips))) as in_app,
      (select max(e.created_at)
         from public.lead_events e
        where e.actor_id = p.agent_id
          and (e.device is null or e.device not in (select ua from op_devices))) as lead_action
    from public.agent_profiles p
    where coalesce(public.is_operator(), false)
      and not p.is_operator
  )
  select agent_id, greatest(in_app, lead_action), in_app, lead_action from app;
$$;
revoke all on function public.operator_last_activity() from public;
grant execute on function public.operator_last_activity() to authenticated;

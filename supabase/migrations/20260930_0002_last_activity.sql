-- "Last active" on the Accounts page: a sign of life per account, the latest
-- of logging in, using the app (session refresh) and doing something to a
-- lead (call, stage change, note; also via the WhatsApp action links).
-- Operators only. Add-only: one new function.
create or replace function public.operator_last_activity()
returns table (agent_id uuid, last_seen timestamptz, last_in_app timestamptz, last_lead_action timestamptz)
language sql
stable
security definer
set search_path = public, auth
as $$
  with app as (
    select p.agent_id,
      greatest(
        (select u.last_sign_in_at from auth.users u where u.id = p.agent_id),
        (select max(r.updated_at) from auth.refresh_tokens r where r.user_id = p.agent_id::text)
      ) as in_app,
      (select max(e.created_at) from public.lead_events e where e.actor_id = p.agent_id) as lead_action
    from public.agent_profiles p
    where coalesce(public.is_operator(), false)
  )
  select agent_id, greatest(in_app, lead_action), in_app, lead_action from app;
$$;
revoke all on function public.operator_last_activity() from public;
grant execute on function public.operator_last_activity() to authenticated;

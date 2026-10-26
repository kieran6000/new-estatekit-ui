-- Teams: a team lead (Bennie Bell) can switch into and work in their members'
-- accounts (Naudé Kritzinger), the way staff can, but only theirs.
-- What a team lead gets in a member's account: see and update their leads and
-- lead history, log calls, edit their lead pages, forms and pipelines, see
-- their results and sold listings. Not: their profile/settings, billing,
-- workflows, or anyone outside the team.
-- Add-only: new column, new function, new policies next to the existing ones
-- (policies are OR'd, so nobody loses access). Two RPC guards also accept a
-- team lead.

alter table public.agent_profiles
  add column if not exists team_lead_id uuid references public.agent_profiles(agent_id) on delete set null;
create index if not exists agent_profiles_team_lead_idx on public.agent_profiles(team_lead_id) where team_lead_id is not null;

-- True when the signed-in user leads the team `p_agent` is in. Security
-- definer so policies on agent_profiles can use it without recursing.
create or replace function public.manages_agent(p_agent uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    p_agent is not null and auth.uid() is not null and exists (
      select 1 from agent_profiles
       where agent_id = p_agent and team_lead_id = auth.uid() and deactivated_at is null
    ), false);
$$;
revoke all on function public.manages_agent(uuid) from public, anon;
grant execute on function public.manages_agent(uuid) to authenticated;

-- Profiles: read only (the switcher, branding, the dashboard header).
create policy "Team leads see their members' profiles" on public.agent_profiles
  for select to authenticated using (manages_agent(agent_id));

-- Leads: see and update (stage, notes, reminders, archive).
create policy "Team leads see their members' leads" on public.leads
  for select to authenticated using (manages_agent(agent_id));
create policy "Team leads update their members' leads" on public.leads
  for update to authenticated using (manages_agent(agent_id)) with check (manages_agent(agent_id));

-- Lead history, and logging their own calls on a member's lead.
create policy "Team leads read their members' lead history" on public.lead_events
  for select to authenticated using (exists (select 1 from leads l where l.id = lead_events.lead_id and manages_agent(l.agent_id)));
create policy "Team leads log calls on their members' leads" on public.lead_events
  for insert to authenticated with check (
    event_type = 'call' and actor_id = auth.uid()
    and exists (select 1 from leads l where l.id = lead_events.lead_id and manages_agent(l.agent_id)));

-- Lead pages, their questions, and pipelines.
create policy "Team leads manage their members' lead pages" on public.lead_pages
  for all to authenticated using (manages_agent(agent_id)) with check (manages_agent(agent_id));
create policy "Team leads manage their members' questions" on public.custom_questions
  for all to authenticated using (manages_agent(agent_id)) with check (manages_agent(agent_id));
create policy "Team leads manage their members' pipelines" on public.pipelines
  for all to authenticated using (manages_agent(agent_id)) with check (manages_agent(agent_id));

-- Read-only bits of the dashboard.
create policy "Team leads see their members' overview" on public.overview_daily
  for select to authenticated using (manages_agent(agent_id));
create policy "Team leads see their members' sold listings" on public.sold_listings
  for select to authenticated using (manages_agent(agent_id));
create policy "Team leads see their members' call questions" on public.call_questions
  for select to authenticated using (manages_agent(agent_id));
create policy "Team leads see their members' setup steps" on public.setup_steps
  for select to authenticated using (manages_agent(agent_id));

-- Results (Dashboard) and deleting a pipeline: also allowed for the team lead.
CREATE OR REPLACE FUNCTION public.get_agent_results_between(p_agent uuid, p_since timestamp with time zone, p_until timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- coalesce: with no login, auth.uid() is null and the check must say no.
  if p_agent is null or p_since is null or p_until is null or not (
    coalesce(p_agent = auth.uid(), false)
    or coalesce(is_operator(), false)
    or coalesce(manages_agent(p_agent), false)
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
$function$;

CREATE OR REPLACE FUNCTION public.delete_pipeline(p_id uuid, p_move_to uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_agent uuid;
  v_used int;
begin
  select agent_id into v_agent from pipelines where id = p_id;
  if v_agent is null then raise exception 'That pipeline doesn''t exist.'; end if;
  if not (v_agent = auth.uid() or is_operator() or manages_agent(v_agent)) then raise exception 'Not allowed.'; end if;
  if (select count(*) from pipelines where agent_id = v_agent) <= 1 then
    raise exception 'An account needs at least one pipeline.';
  end if;
  select (select count(*) from leads where pipeline_id = p_id) + (select count(*) from lead_pages where pipeline_id = p_id) into v_used;
  if p_move_to is not null and not exists (select 1 from pipelines where id = p_move_to and agent_id = v_agent and id <> p_id) then
    raise exception 'Pick one of this account''s other pipelines.';
  end if;
  if v_used > 0 and p_move_to is null then
    raise exception 'Pick a pipeline to move its leads and forms to.';
  end if;
  if p_move_to is not null then
    update leads set pipeline_id = p_move_to where pipeline_id = p_id;
    update lead_pages set pipeline_id = p_move_to where pipeline_id = p_id;
    update workflows set definition = replace(definition::text, 'id:' || p_id::text, 'id:' || p_move_to::text)::jsonb
      where agent_id = v_agent and definition::text like 'NaNd:' || p_id::text || '%';
  end if;
  delete from pipelines where id = p_id;
end $function$;

-- Bennie Bell leads Naudé Kritzinger.
update public.agent_profiles set team_lead_id = 'd5bd1eea-d3d5-4daa-9e15-ab3c621192eb'
 where agent_id = '0eba9b17-2e1a-4bc9-91bc-096e33cf39e1' and team_lead_id is null;

-- A signed-in agent (or an operator viewing a client's lead) can get the same
-- share link an automation would send: leads.estatekit.co/l/<token>.
-- The lone RLS policy on lead_share_tokens is agent_id = auth.uid(), so an
-- operator looking at a client's lead can neither read nor mint a token under
-- it. This SECURITY DEFINER function does the ownership/operator check itself,
-- reuses a live token when there is one, and otherwise mints a 12-char one
-- (same alphabet and 90-day life as run-automations' generateActionLink).
create or replace function public.ensure_lead_link(p_lead_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agent uuid;
  v_uid   uuid := auth.uid();
  v_token text;
  v_abc   text := 'abcdefghijkmnpqrstuvwxyz23456789';
  i int;
begin
  if v_uid is null then
    raise exception 'not signed in';
  end if;

  select agent_id into v_agent from leads where id = p_lead_id;
  if v_agent is null then
    return null;
  end if;

  if v_agent <> v_uid and not public.is_operator() then
    raise exception 'not allowed';
  end if;

  -- Reuse a still-valid token so one lead doesn't collect a new link each time.
  select token into v_token
    from lead_share_tokens
    where lead_id = p_lead_id and (expires_at is null or expires_at > now())
    order by created_at desc
    limit 1;
  if v_token is not null then
    return v_token;
  end if;

  v_token := '';
  for i in 1..12 loop
    v_token := v_token || substr(v_abc, 1 + floor(random() * length(v_abc))::int, 1);
  end loop;

  insert into lead_share_tokens (lead_id, agent_id, token, link_type, expires_at)
    values (p_lead_id, v_agent, v_token, 'first_touch', now() + interval '90 days');

  return v_token;
end;
$$;

grant execute on function public.ensure_lead_link(uuid) to authenticated;

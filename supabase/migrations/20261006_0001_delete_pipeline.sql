-- Delete a pipeline, moving its leads, forms and workflow checks to another
-- of the same account's pipelines first. An account keeps at least one.
create or replace function public.delete_pipeline(p_id uuid, p_move_to uuid default null) returns void language plpgsql security invoker set search_path = public as $$
declare v_agent uuid; v_used int;
begin
  select agent_id into v_agent from pipelines where id = p_id;
  if v_agent is null then raise exception 'That pipeline doesn''t exist.'; end if;
  if not (v_agent = auth.uid() or is_operator()) then raise exception 'Not allowed.'; end if;
  if (select count(*) from pipelines where agent_id = v_agent) <= 1 then raise exception 'An account needs at least one pipeline.'; end if;
  select (select count(*) from leads where pipeline_id = p_id) + (select count(*) from lead_pages where pipeline_id = p_id) into v_used;
  if p_move_to is not null and not exists (select 1 from pipelines where id = p_move_to and agent_id = v_agent and id <> p_id) then raise exception 'Pick one of this account''s other pipelines.'; end if;
  if v_used > 0 and p_move_to is null then raise exception 'Pick a pipeline to move its leads and forms to.'; end if;
  if p_move_to is not null then
    update leads set pipeline_id = p_move_to where pipeline_id = p_id;
    update lead_pages set pipeline_id = p_move_to where pipeline_id = p_id;
    update workflows set definition = replace(definition::text, 'id:' || p_id::text, 'id:' || p_move_to::text)::jsonb where agent_id = v_agent and definition::text like '%id:' || p_id::text || '%';
  end if;
  delete from pipelines where id = p_id;
end $$;
revoke all on function public.delete_pipeline(uuid, uuid) from public, anon;
grant execute on function public.delete_pipeline(uuid, uuid) to authenticated;

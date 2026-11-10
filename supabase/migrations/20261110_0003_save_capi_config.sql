-- Saving tracking settings with a new access token. Browsers can no longer
-- read access_token (0002), and an upsert that overwrites a column must be
-- able to read it, so the save goes through this function instead. Same
-- rules as the row policies: staff, or a self-run account for a pixel only
-- its own pages use.
create or replace function public.save_capi_config(
  p_pixel_id text,
  p_enabled boolean,
  p_test_event_code text,
  p_access_token text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_token text := nullif(btrim(coalesce(p_access_token, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Not allowed';
  end if;
  if not coalesce(is_operator(), false) then
    if not (
      coalesce(runs_own_account(), false)
      and exists (select 1 from lead_pages lp where lp.fb_pixel_id = p_pixel_id and lp.agent_id = auth.uid())
      and not exists (select 1 from lead_pages o where o.fb_pixel_id = p_pixel_id and o.agent_id <> auth.uid())
    ) then
      raise exception 'Not allowed';
    end if;
  end if;

  if exists (select 1 from fb_capi_config where pixel_id = p_pixel_id) then
    update fb_capi_config
       set enabled = p_enabled,
           test_event_code = nullif(btrim(coalesce(p_test_event_code, '')), ''),
           access_token = coalesce(v_token, access_token),
           updated_at = now()
     where pixel_id = p_pixel_id;
  else
    if v_token is null then
      raise exception 'Paste the access token first';
    end if;
    insert into fb_capi_config (pixel_id, enabled, test_event_code, access_token)
    values (p_pixel_id, p_enabled, nullif(btrim(coalesce(p_test_event_code, '')), ''), v_token);
  end if;
end;
$function$;
revoke all on function public.save_capi_config(text, boolean, text, text) from public, anon;
grant execute on function public.save_capi_config(text, boolean, text, text) to authenticated;

-- The general marketing plan, for people who reach the thank-you page from a
-- Facebook instant form's end button. Facebook doesn't say who they are, and
-- their lead isn't synced yet, so there's no personal plan to show: this
-- returns the form's agent details (already public on the landing page and
-- /sold page) and whether it's a seller form (the plan is the default lead
-- magnet only on seller forms). No lead details, and nothing is logged.
-- Add-only: one new function.
create or replace function public.get_page_plan(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  pg record;
  a record;
  v_kind text;
  v_sales jsonb;
begin
  if p_slug is null or p_slug !~ '^[a-z0-9-]{1,80}$' then
    return null;
  end if;

  select id, agent_id, slug, accent_color, phone, pipeline_id into pg
  from lead_pages where slug = p_slug;
  if pg.id is null then return null; end if;

  select kind into v_kind from pipelines where id = pg.pipeline_id;
  select display_name, company, email, whatsapp_number, avatar_url into a
  from agent_profiles where agent_id = pg.agent_id;

  select coalesce(jsonb_agg(jsonb_build_object('address', s.address, 'price', s.price, 'status', s.status, 'image_url', s.image_url) order by s.sort_order), '[]'::jsonb)
  into v_sales
  from (select * from sold_listings where agent_id = pg.agent_id order by sort_order limit 6) s;

  return jsonb_build_object(
    'lead_id', '00000000-0000-0000-0000-000000000000',
    'lead_name', '',
    'address', '',
    'reason', '',
    'timeline', '',
    'date', to_char(now() at time zone 'Africa/Johannesburg', 'DD Mon YYYY'),
    'agent_name', coalesce(a.display_name, ''),
    'company', coalesce(a.company, ''),
    'agent_email', coalesce(a.email, ''),
    'agent_phone', coalesce(nullif(a.whatsapp_number, ''), pg.phone, ''),
    'photo', case when a.avatar_url ~ '^https://' then a.avatar_url else null end,
    'accent', coalesce(pg.accent_color, '#1976d2'),
    'page_slug', pg.slug,
    'sales', v_sales,
    'pipeline_kind', coalesce(v_kind, '')
  );
end;
$$;
revoke all on function public.get_page_plan(text) from public;
grant execute on function public.get_page_plan(text) to anon, authenticated;

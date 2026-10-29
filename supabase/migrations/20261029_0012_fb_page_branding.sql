-- Facebook-form thank-you pages had no logo, photo or colour of their own
-- (that editor is for landing pages), so they showed the default blue. They
-- take the agent's profile ones: logo, photo, sidebar colour. Only empty
-- fields, only Facebook-form pages; anything already set stays.
update public.lead_pages p
   set logo_data_url = coalesce(p.logo_data_url, a.sidebar_logo_url),
       profile_photo_data_url = coalesce(p.profile_photo_data_url, a.avatar_url),
       accent_color = case when p.accent_color = '#1976d2' and a.sidebar_color is not null then a.sidebar_color else p.accent_color end
  from public.agent_profiles a
 where a.agent_id = p.agent_id and p.source_type = 'fb_form';

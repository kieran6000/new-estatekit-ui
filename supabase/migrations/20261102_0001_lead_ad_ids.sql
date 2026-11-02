-- Landing-page leads from an ad carry its id in the link: our ads' URL
-- parameters put {{ad.id}} in utm_content (fb-lead-source-ad reads the same).
-- Fill fb_ad_id from it where it's missing, so bookings and mandates can be
-- counted per ad. Every lead already resolved this way matched (218 of 218).
update public.leads
set fb_ad_id = attribution->>'utm_content'
where fb_ad_id is null
  and fb_lead_id is null
  and attribution->>'utm_source' ~* '^(fb|facebook|ig|instagram)$'
  and attribution->>'utm_content' ~ '^\d{6,25}$';

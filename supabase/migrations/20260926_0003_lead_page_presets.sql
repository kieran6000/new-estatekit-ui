-- Form presets by friction level (Most leads / Balanced / Best quality, from
-- the Media Buyer SOP) and an editable "not a fit" screen. Add-only columns
-- with defaults: existing pages and the live site are unaffected.

-- Which preset the page's form was built from. Null = built by hand.
alter table public.lead_pages add column if not exists preset text
  check (preset is null or preset in ('most_leads', 'balanced', 'best_quality'));

-- What someone sees when an answer turns them away. Blank = the built-in
-- wording and no button.
alter table public.lead_pages add column if not exists dq_headline text not null default '';
alter table public.lead_pages add column if not exists dq_text text not null default '';
alter table public.lead_pages add column if not exists dq_cta_label text not null default '';
alter table public.lead_pages add column if not exists dq_cta_url text not null default '';

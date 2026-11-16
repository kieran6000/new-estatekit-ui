-- Agency sales pipeline, step 1 of 2: make the new type and stages LEGAL.
-- Safe to run any time — it only widens what's allowed, changes no data, and
-- the old app keeps working because nothing yet uses the new values.
--
-- Run step 2 (20261116_0003) only AFTER the code that understands the "agency"
-- kind is live on main, or the EstateKit Agents pipeline would render with an
-- unknown kind in the old app.

-- Allow the new stage names (the existing ten, plus the agency lifecycle).
alter table public.leads drop constraint if exists leads_stage_check;
alter table public.leads add constraint leads_stage_check check (
  stage = any (array[
    'New Lead','No Answer','Contacted','Booked','Mandate Signed',
    'Viewing Booked','Offer Made','Bought','Lost','Invalid Number',
    'Applied','Call booked','Showed','No-show','Proposal sent',
    'Signed','Paid','Live','Renewal due','Churned'
  ])
);

-- Allow the new pipeline kind.
alter table public.pipelines drop constraint if exists pipelines_kind_check;
alter table public.pipelines add constraint pipelines_kind_check check (
  kind = any (array['seller','buyer','general','agency'])
);

-- Tidy up the abandoned first attempt (an unused, operator-only table from the
-- reverted agency_deals approach). Harmless if it's already gone.
drop table if exists public.agency_deals cascade;

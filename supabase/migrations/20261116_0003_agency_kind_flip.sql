-- Agency sales pipeline, step 2 of 2: switch the EstateKit Agents pipeline to
-- the new "agency" kind and rename its leads' stages to the sales lifecycle.
--
-- RUN THIS ONLY AFTER the code that understands "agency" is live on main
-- (merge dev → main first). Running it earlier would show that pipeline with
-- an unknown kind in the old app. Step 1 (20261116_0002) must already be in.
--
-- One-way in practice, but reversible by hand: set kind back to 'general' and
-- map the stages back (Applied→New Lead, Call booked→Booked, Showed→Contacted,
-- No-show→No Answer, Signed→Mandate Signed).

-- Rename the existing leads' stages first, so no row is ever briefly on a
-- stage the new kind doesn't list.
update public.leads l
set stage = case l.stage
    when 'New Lead'        then 'Applied'
    when 'Booked'          then 'Call booked'
    when 'Contacted'       then 'Showed'
    when 'No Answer'       then 'No-show'
    when 'Mandate Signed'  then 'Signed'
    when 'Invalid Number'  then 'Lost'
    else l.stage           -- 'Lost' stays 'Lost'
  end
from public.pipelines p
where l.pipeline_id = p.id
  and p.name = 'EstateKit Agents'
  and l.stage in ('New Lead','Booked','Contacted','No Answer','Mandate Signed','Invalid Number');

-- Then flip the pipeline kind.
update public.pipelines set kind = 'agency' where name = 'EstateKit Agents';

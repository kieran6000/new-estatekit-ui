-- APPLIED 2026-09-25 via Supabase MCP. Kept for the record.
--
-- Siva's "Home Value" form was killing almost everyone who filled it in.
--
-- What the funnel showed, once the 17-21 Sept delivery blackout was set aside
-- and the numbers were read per-visitor instead of per-lead:
--
--   day      views  started  reached contact  submitted  disqualified
--   13 Sep      38       24               13          8             9
--   14 Sep      42       23               18         14             0
--   15 Sep      47       32               19         14             3
--   16 Sep      50       31               16         12             8
--   17-21 Sep    ~0        0                0          0             0   <- ads not delivering
--   22 Sep      18       11                0          0             9   <- Q6 added 15:41 UTC
--   23 Sep      50       25                0          0            21
--   24 Sep      58       30                1          1            23
--
-- Traffic came back on 22 Sept at the same level as before. Reaching the
-- contact step did not: 66 people started the form over three days, 53 were
-- rejected, 1 submitted. The rejection was Q6, a 39-word consent paragraph
-- sitting immediately before the contact step, whose "no" created no lead.
--
-- Two changes, same principle:
--   1. Q6 goes from 39 words to 13. A fourth grader can read it.
--   2. Its "no" stops killing the lead and marks it weak instead. Siva still
--      gets the name and number and sells the visit on the phone, where that
--      sale belongs; Facebook is never told it was a conversion, so the pixel
--      stops optimising toward people who only want an online number.
--
-- Deliberately unchanged: the ownership question (a non-owner cannot sign a
-- mandate, so that rejection is correct) and "What's pushing you to consider
-- selling?" -- reason-for-selling is the strongest predictor of a 0-3 month
-- timeline in our own data (n=783), so it earns its place on the form.

update custom_questions
set label = 'A real price means seeing the house. Is it OK if Sivanasen visits?',
    options = '["Yes, that''s fine", "No, just send me a number online"]'::jsonb,
    disqualify_answers = array[]::text[],
    low_quality_answers = array['No, just send me a number online']::text[]
where id = '1bff2998-2606-4f41-b8f6-b9ebf4bf238d';

-- "Just exploring" -> weak lead instead of no lead. "Not selling" still rejects.
update custom_questions
set disqualify_answers = array['Not selling']::text[],
    low_quality_answers = array['Just exploring']::text[]
where id = '5e754182-e2e1-425d-bdd8-d0015999ff2e';

-- The thank-you screen promised a report was being prepared; the form says the
-- report only follows the visit. Make them agree.
update lead_pages
set thank_you_headline = 'Thanks {name} - Sivanasen will call you shortly'
where id = 'cdd32fe8-d17e-4044-b65e-89db1369ac71';

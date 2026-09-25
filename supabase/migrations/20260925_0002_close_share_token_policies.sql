-- RELEASE 2 OF 2 (remove). DO NOT RUN until ALL of these are true:
--
--   1. 20260925_0001_share_link_function.sql has been run.
--   2. The website change that calls get_shared_lead is live on
--      leads.estatekit.co (merged to main and deployed).
--   3. You have opened a real /l/<token> WhatsApp link on the live site and
--      it showed the lead.
--
-- Run it before step 2 and every share link agents have been sent stops
-- working until the website is deployed.
--
-- What it closes: see 20260925_0001. After this, the only ways to reach a
-- lead through a share token are get_shared_lead (one lead, only with the
-- exact token) and the log-outcome / lead-note / lead-call functions (same).
-- Nothing else reads these tables anonymously: the public lead pages read
-- lead_pages, pipelines, custom_questions and sold_listings only.
--
-- Agents keep their own tokens via "Agents manage own tokens". Operators
-- keep everything via their is_operator() policies. Edge functions use the
-- service role and are unaffected by RLS.

drop policy if exists "Anon can read leads with valid tokens" on public.leads;
drop policy if exists "Authenticated can read leads with valid tokens" on public.leads;
drop policy if exists "Anon can read agent profiles for token leads" on public.agent_profiles;
drop policy if exists "Anyone can read lead_share_tokens" on public.lead_share_tokens;

-- Check: expect 0 rows
select tablename, policyname from pg_policies
where schemaname = 'public'
  and policyname in (
    'Anon can read leads with valid tokens',
    'Authenticated can read leads with valid tokens',
    'Anon can read agent profiles for token leads',
    'Anyone can read lead_share_tokens'
  );

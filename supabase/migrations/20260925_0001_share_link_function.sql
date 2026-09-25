-- RELEASE 1 OF 2 (add-only). Safe to run any time. Changes nothing existing.
--
-- The leak this starts to close
-- -----------------------------
-- Three policies let the public API key (it ships inside the website) read
-- private data with no token at all:
--
--   leads          "Anon can read leads with valid tokens"
--                  USING (id IN (any lead with an unexpired token))
--   leads          "Authenticated can read leads with valid tokens"
--                  same condition, for any signed-in agent
--   agent_profiles "Anon can read agent profiles for token leads"
--
-- The condition never asks WHICH token the caller holds, so `select * from
-- leads` returns every lead that has any live token: ~286 of 1,200 on
-- 25 Sept, with names and phone numbers. Tokens are minted for every website
-- lead (24h), every automation WhatsApp (7d) and every Discord activity card
-- (30d), so this is a rolling window over the most recent, most active leads.
-- On top of that, "Anyone can read lead_share_tokens" lists the tokens
-- themselves, and a token lets you log outcomes, add notes and mark calls on
-- that lead via log-outcome / lead-note / lead-call.
--
-- What this release adds
-- ----------------------
-- One function that takes a token and returns that single lead, the agent's
-- WhatsApp number and the pipeline kind: exactly what the /l/<token> page
-- needs, and nothing it doesn't. The share page switches to it (see
-- src/api/leadActions.ts), and falls back to the old reads if this function
-- isn't there yet, so the two can ship in either order.
--
-- Release 2 (20260925_0002) drops the open policies once this is live.
--
-- Dry-run on production inside BEGIN/ROLLBACK on 25 Sept: valid token returns
-- {lead (all 22 columns), agent_phone, pipeline_kind}; unknown and expired
-- tokens return null; anon can execute.

create or replace function public.get_shared_lead(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'lead', to_jsonb(l.*),
    'agent_phone', coalesce(ap.whatsapp_number, ''),
    'pipeline_kind', coalesce(p.kind::text, 'seller')
  )
  from lead_share_tokens t
  join leads l on l.id = t.lead_id and l.agent_id = t.agent_id
  left join agent_profiles ap on ap.agent_id = t.agent_id
  left join pipelines p on p.id = l.pipeline_id
  where t.token = p_token
    and t.expires_at > now()
  limit 1;
$$;

comment on function public.get_shared_lead(text) is
  'The /l/<token> share page: one lead, its agent''s WhatsApp number and pipeline kind, for an unexpired token only. Replaces anonymous table reads on leads / agent_profiles / lead_share_tokens.';

revoke all on function public.get_shared_lead(text) from public, anon, authenticated;
grant execute on function public.get_shared_lead(text) to anon, authenticated, service_role;

-- Check: expect one row, anon_can_call = true
select has_function_privilege('anon', 'public.get_shared_lead(text)', 'execute') as anon_can_call;

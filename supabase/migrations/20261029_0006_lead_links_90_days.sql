-- Lead links (leads.estatekit.co/l/…) are the agent's own link to a lead,
-- sent in their WhatsApp alerts. They lasted 24 hours to 30 days, so an
-- agent opening last week's alert got "Link not valid" (Shoaib, 29 Oct
-- 2026). Every link now lasts 90 days from when it was sent; the functions
-- that make them were changed to match.
update public.lead_share_tokens
   set expires_at = created_at + interval '90 days'
 where expires_at < created_at + interval '90 days';

-- An even older link still knows which lead it was for, so the page can
-- offer to open that lead in EstateKit instead of a dead end. Only the id:
-- the lead itself stays behind sign-in (its own policies). The token is 32
-- random hex characters, so it can't be guessed.
create or replace function public.lead_id_for_link(p_token text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select lead_id from lead_share_tokens where token = p_token limit 1;
$$;

grant execute on function public.lead_id_for_link(text) to anon, authenticated;

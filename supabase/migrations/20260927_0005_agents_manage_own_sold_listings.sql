-- Agents manage their own recent sales (Forms page → Recent sales). Until now
-- only operators could add, change or remove them. Add-only: three new
-- policies, each limited to the agent's own rows. Operator policies and the
-- public read policy are unchanged.
drop policy if exists "Agents insert own sold_listings" on public.sold_listings;
create policy "Agents insert own sold_listings" on public.sold_listings
  for insert to authenticated with check (agent_id = auth.uid());

drop policy if exists "Agents update own sold_listings" on public.sold_listings;
create policy "Agents update own sold_listings" on public.sold_listings
  for update to authenticated using (agent_id = auth.uid()) with check (agent_id = auth.uid());

drop policy if exists "Agents delete own sold_listings" on public.sold_listings;
create policy "Agents delete own sold_listings" on public.sold_listings
  for delete to authenticated using (agent_id = auth.uid());

-- Agents see the History section on their own leads (it was staff-only).
-- Applied 3 Oct 2026. Same rule as the leads table: your own leads only.
create policy "Agents read their own leads' history" on public.lead_events for select to authenticated
  using (exists (select 1 from public.leads l where l.id = lead_events.lead_id and l.agent_id = (select auth.uid())));

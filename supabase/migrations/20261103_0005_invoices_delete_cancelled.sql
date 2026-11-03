-- The team can delete an invoice once it's cancelled. Anything still open or
-- paid can't be deleted, by the app or by anyone calling the database directly.

drop policy if exists "Operators delete cancelled invoices" on public.invoices;
create policy "Operators delete cancelled invoices" on public.invoices
  for delete to authenticated using (coalesce(public.is_operator(), false) and voided_at is not null);

grant delete on public.invoices to authenticated;

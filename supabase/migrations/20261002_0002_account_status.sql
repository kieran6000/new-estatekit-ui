-- Deactivating a client (Accounts → client → Settings → Deactivate).
-- Applied on 2 Oct 2026. The account-status edge function sets these; the
-- trigger stops anyone but staff (or the service role) changing them, so a
-- client can't switch their own account back on.
alter table public.agent_profiles
  add column if not exists deactivated_at timestamptz,
  add column if not exists deactivated_reason text,
  add column if not exists deactivated_by_name text,
  add column if not exists automations_paused_before_deactivation boolean;

create or replace function public.guard_account_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.deactivated_at is distinct from old.deactivated_at
      or new.deactivated_reason is distinct from old.deactivated_reason
      or new.deactivated_by_name is distinct from old.deactivated_by_name
      or new.automations_paused_before_deactivation is distinct from old.automations_paused_before_deactivation)
     and coalesce(auth.role(), '') <> 'service_role'
     and not coalesce(public.is_operator(), false) then
    raise exception 'Only EstateKit staff can change an account''s status';
  end if;
  return new;
end $$;

drop trigger if exists guard_account_status on public.agent_profiles;
create trigger guard_account_status before update on public.agent_profiles
  for each row execute function public.guard_account_status();

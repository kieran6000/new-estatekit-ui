-- Confirmation email to new leads, sent on the agent's behalf (Resend, from
-- mail.estatekit.co, replies go to the agent). Add-only.
--
-- OFF for every agent by default: nothing is sent for anyone until an
-- operator switches it on for that client (Clients -> Account).

alter table public.agent_profiles add column if not exists lead_confirmation_email boolean not null default false;

-- Set by send-lead-confirmation once the email is sent (or claimed), so a
-- lead is never emailed twice.
alter table public.leads add column if not exists confirmation_sent_at timestamptz;

-- New lead with an email, for an agent who has it switched on: ask the
-- send-lead-confirmation function to send it. pg_net queues the call, so a
-- slow or failed email never blocks saving the lead.
create or replace function public.queue_lead_confirmation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(btrim(new.email), '') <> ''
     and exists (select 1 from agent_profiles where agent_id = new.agent_id and lead_confirmation_email) then
    perform net.http_post(
      url := 'https://yfcnsvrhojpysrzqrkdi.supabase.co/functions/v1/send-lead-confirmation',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := jsonb_build_object('id', new.id)
    );
  end if;
  return new;
end;
$$;

revoke all on function public.queue_lead_confirmation() from public, anon, authenticated;

drop trigger if exists leads_queue_confirmation on public.leads;
create trigger leads_queue_confirmation
  after insert on public.leads
  for each row execute function public.queue_lead_confirmation();

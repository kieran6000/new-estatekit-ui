-- Weekly reports sent to agents by the CSM (Accounts → Weekly reports).
-- Each send freezes the report as it was sent (data), so the agent sees
-- exactly what the CSM sent and the numbers never shift under a dispute.
-- The agent opens it at /r/<token> without signing in; the weekly-report
-- edge function serves it and counts the open. Rows are written only by that
-- function (service role); operators can read them.
create table if not exists public.weekly_report_sends (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null,
  week_start date not null,
  period text not null,
  data jsonb not null,
  token text not null unique,
  channel text not null default 'whatsapp',
  status text not null default 'sending',
  error text,
  sent_by uuid,
  sent_by_name text,
  sent_at timestamptz not null default now(),
  first_opened_at timestamptz,
  last_opened_at timestamptz,
  open_count integer not null default 0
);

create index if not exists weekly_report_sends_agent_week on public.weekly_report_sends (agent_id, week_start desc, sent_at desc);

alter table public.weekly_report_sends enable row level security;

drop policy if exists "Operators read weekly report sends" on public.weekly_report_sends;
create policy "Operators read weekly report sends" on public.weekly_report_sends
  for select to authenticated using (coalesce(public.is_operator(), false));

revoke all on public.weekly_report_sends from anon;
revoke insert, update, delete, truncate on public.weekly_report_sends from authenticated;
grant select on public.weekly_report_sends to authenticated;

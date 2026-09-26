-- Per-agent wording for the confirmation email's main text. Null = the
-- standard wording (in send-lead-confirmation and src/lib/leadEmail.ts).
-- Edited by operators on the Forms page; applies from the next lead on.
-- Add-only.
alter table public.agent_profiles add column if not exists lead_email_body text
  check (lead_email_body is null or length(lead_email_body) <= 1500);

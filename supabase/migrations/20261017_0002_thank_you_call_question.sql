-- The wording of the thank-you page's call-time question, per form (blank =
-- "When suits you for a quick call?"). Add-only: one new column.
-- The answer is still saved under the standard question (set_call_time), so
-- every lead's call time reads the same however the page words it.
alter table public.lead_pages add column if not exists thank_you_call_question text;

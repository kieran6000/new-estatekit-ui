-- New lead-form question type "call_time": "When suits you for a quick
-- call?" (a day in the next 7 days + morning / afternoon / after work). The
-- answer is saved like any other answer, as text, e.g. "Thu 16 Oct · Morning
-- (8–12)". Add-only: the allowed types gain one value; nothing else changes.
alter table public.custom_questions drop constraint if exists custom_questions_type_check;
alter table public.custom_questions add constraint custom_questions_type_check
  check (type = any (array['short_text', 'address', 'multiple_choice', 'yes_no', 'call_time']));

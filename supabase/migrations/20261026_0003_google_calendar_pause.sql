-- Google Calendar isn't switched on yet (no Google keys, nobody connected), so
-- the every-minute sync job has nothing to do. Pause it; the Calendar tab
-- doesn't need it. To switch Google on later:
--   select cron.alter_job((select jobid from cron.job where jobname = 'google-calendar-sync-every-minute'), active := true);
-- Add-only: nothing is dropped.
select cron.alter_job((select jobid from cron.job where jobname = 'google-calendar-sync-every-minute'), active := false)
 where exists (select 1 from cron.job where jobname = 'google-calendar-sync-every-minute');

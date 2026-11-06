// Each minute (cron, only when there's work): puts what changed into agents'
// Google Calendars. Works through google_calendar_queue, filled by a trigger
// on leads (appointments, picked call times, follow-up reminders), one
// claimed batch at a time (../_shared/calendarSync.ts does each row), then
// takes out the upcoming entries of deleted leads (google_calendar_trash).
// Auth: the cron's x-cron-key (GOOGLE_CALENDAR_CRON_KEY, generated in the
// vault by migration 20261104_0001). Nobody else can run it.
// Needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the vault.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { CalendarSync, type QueueRow } from "../_shared/calendarSync.ts";
import { json, sameSecret, secret } from "../_shared/google.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const BATCH = 40;
const BUDGET_MS = 40_000; // stop claiming more after this; the next minute carries on

Deno.serve(async (req) => {
  const key = await secret(admin, "GOOGLE_CALENDAR_CRON_KEY");
  if (!sameSecret(req.headers.get("x-cron-key") || "", key)) return json({ error: "forbidden" }, 401);

  const started = Date.now();
  const sync = new CalendarSync(admin);
  const tally: Record<string, number> = {};
  let processed = 0;
  while (Date.now() - started < BUDGET_MS) {
    const { data: rows, error } = await admin.rpc("google_calendar_claim", { p_limit: BATCH });
    if (error) {
      console.error("claim", error.message);
      break;
    }
    if (!rows?.length) break;
    for (const q of rows as QueueRow[]) {
      const r = await sync.run(q);
      tally[r.action] = (tally[r.action] ?? 0) + 1;
      processed++;
    }
    if (rows.length < BATCH) break;
  }
  const trashed = await sync.emptyTrash();
  await sync.finish();
  return json({ processed, trashed, ...tally, ms: Date.now() - started });
});

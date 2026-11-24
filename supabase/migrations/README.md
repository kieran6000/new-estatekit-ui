# Migrations

Numbered, ordered SQL. Apply in filename order.

**Baseline:** these files start partway through the project's life. Everything
before `20260919` was applied directly against the live database (project
`yfcnsvrhojpysrzqrkdi`) before this folder existed, so the live schema — not a
file here — is the starting point. Treat these as "changes since 19 Sep 2026".

Applied earlier without a file, recorded here so the history isn't silently
missing them:

| When | What |
|---|---|
| 14 Sep 2026 | `lock_down_get_secret_rpc` — revoked `EXECUTE` on `get_secret()` from `anon`/`authenticated`/`PUBLIC`; pinned `search_path` on the SECURITY DEFINER functions |
| 19 Sep 2026 | `agent_daily_nudges` — table + unique `(agent_id, sent_on)` guard for the end-of-day nudge |
| 19 Sep 2026 | `lead_attribution` — `leads.attribution jsonb` + partial index on `attribution->>'ad_id'` |

## Naming

New files use a unique **14-digit timestamp** version, `YYYYMMDDHHMMSS_name.sql`
(e.g. `20261124120000_bookings_overflow.sql`). The old `YYYYMMDD_NNNN` files are
kept as-is (already applied); don't add more of that form — two on the same day
share the `YYYYMMDD` version, which makes `supabase db push` ambiguous.

## Applying

No Supabase CLI login is configured locally. Either:

- paste the file into the SQL editor in the Supabase dashboard (the reliable
  path here), or
- `supabase db push` once `SUPABASE_ACCESS_TOKEN` is set and the project is
  linked.

Each file is written to be safe to re-run (`if not exists`, `on conflict do
nothing`), so a partial apply can be repeated without damage.

**Apply the schema BEFORE deploying any edge function that depends on it.** On
24 Nov 2026 the booking functions were deployed while `db push` silently failed
to apply `bookings_overflow` / `booking_hosts`, so `booking-create` inserted
into columns that didn't exist and 502'd every /pitch booking. Run the migration
(SQL editor), confirm the columns/indexes exist, THEN deploy the functions.

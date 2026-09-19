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

## Applying

No Supabase CLI login is configured locally. Either:

- paste the file into the SQL editor in the Supabase dashboard, or
- `supabase db push` once `SUPABASE_ACCESS_TOKEN` is set.

Each file is written to be safe to re-run (`if not exists`, `on conflict do
nothing`), so a partial apply can be repeated without damage.

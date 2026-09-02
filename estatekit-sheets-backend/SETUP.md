# EstateKit — Google Sheets backend setup

## What this is
- **backend/Code.gs** — the entire API. Deploy it as a Google Apps Script Web App.
  It reads/writes Google Sheets directly (no service account, no DB).
- **src/api/*.ts** — drop-in replacements for your mock `src/api/*.ts` files.
  Same function signatures as before, so no hooks/pages/components change.

## Data model
- One **control spreadsheet** (you create this once) with two tabs:
  `Accounts` (phone → agent_id → their own spreadsheet id) and `PageIndex`
  (so a public lead-page form submit can find the right client without a
  login token).
- One **spreadsheet per client**, auto-created on their first login. Inside it:
  - One tab **per pipeline** (tab name = pipeline id) holding that pipeline's
    leads — this is your "1 pipeline = 1 tab" requirement.
  - Fixed tabs: `Pipelines`, `LeadPages`, `CustomQuestions`, `Overview`,
    `Automations`, `AutomationSteps`, `CallQuestions`, `SupportTickets`, `Profile`.

## 1. Create the control spreadsheet
Go to sheets.new, create a blank spreadsheet, name it "EstateKit Control".
Copy its ID from the URL (`.../d/THIS_PART/edit`).

## 2. Add the Apps Script project
In that spreadsheet: **Extensions → Apps Script**. Delete the placeholder
`Code.gs` content and paste in `backend/Code.gs` from this bundle.

## 3. Set Script Properties
In the Apps Script editor: **Project Settings (gear icon) → Script Properties → Add property**:

| Property | Value |
|---|---|
| `CONTROL_SHEET_ID` | the spreadsheet ID from step 1 |
| `AUTH_SECRET` | any long random string (e.g. generate one with `openssl rand -hex 32`) |
| `TEXTMEBOT_API_KEY` | your TextMeBot API key |

## 4. Run the one-time setup
Back in the Apps Script editor, select `runOneTimeSetup` in the function
dropdown at the top, click **Run**. First run will ask you to authorize the
script (it needs Sheets, Drive, and external-request access) — approve it.
This creates the `Accounts`, `PageIndex` and `PendingActions` tabs.

## 5. Install the automation trigger
Select `installTimeTrigger` in the function dropdown, click **Run** once.
This registers a time-driven trigger that calls `processPendingActions`
every 10 minutes — it's what actually fires any automation step with
`delay_minutes > 0` (instant, `delay_minutes === 0` steps run inline and
don't need this). Check **Triggers** (clock icon) in the editor sidebar to
confirm it's there; re-running `installTimeTrigger` creates a duplicate, so
don't run it twice.

## 6. Deploy as a Web App
**Deploy → New deployment → gear icon → Web app**:
- Execute as: **Me**
- Who has access: **Anyone**
Click Deploy, copy the **Web app URL** — this is your API endpoint.

## 7. Wire the frontend
1. Copy every file from this bundle's `src/api/` into your repo's `src/api/`,
   overwriting the mock versions. Delete `src/api/_store.ts` — nothing else
   imports it once these are swapped.
2. Add a `.env` file at the repo root:
   ```
   VITE_API_URL=https://script.google.com/macros/s/XXXXXXXX/exec
   ```
3. `npm run dev` — you're live.
4. Deploying to Vercel: set `VITE_API_URL` (and the PostHog vars) in the
   project's Environment Variables, and make sure it points at the *current*
   deployment URL — every time you **Deploy → Manage deployments → New
   deployment** in Apps Script (rather than just saving), you get a new
   URL unless you re-deploy the same "Head" version.

## Migrating accounts created before this seeding/automations/tier setup existed
If you already have client spreadsheets from an earlier version of this
backend (empty `Automations`/`LeadPages` tabs, `tier` defaulted to `'free'`):
1. Update Code.gs to this version first.
2. Run `migrateSeedExistingAccounts` once from the editor. It backfills the
   4 default automations + steps and one default LeadPage per pipeline for
   any account missing them — safe to run more than once, it never
   duplicates existing rows.
3. It does **not** touch existing accounts' `tier` value — that's a billing
   decision, not something a data migration should silently change. Bump
   any existing client's `Profile.tier` to `paid` by hand (edit the cell
   directly in their spreadsheet) if that's what launch requires.

## Testing the OTP flow
- The dev/test number `+10000000000` with code `000000` still works and
  **skips real WhatsApp sending** — handy for local testing.
- Any other number triggers a real WhatsApp OTP via TextMeBot, valid for 5
  minutes, and creates a brand-new client spreadsheet for that phone number
  automatically on first successful verify.

## Notes / honest limits
- Every write takes a script lock, so concurrent writes are safe but
  serialized — fine at your current agent count; would need a real DB if a
  single pipeline tab grows into the tens of thousands of rows.
- New accounts default to the `paid` tier, and there is no `tier.set`
  action in `route()` at all — a client session can never change its own
  tier. If you ever bring back a real free tier, that has to be an
  operator/admin-only action, not something the frontend calls directly.
- Automations actually fire now: `lead_created` runs on every new lead
  (manual add or public lead-page submit), `stage_changed` runs on
  `leads.update` when `patch.stage` differs from the lead's current stage.
  Instant steps (`delay_minutes === 0`) run inline in the same request;
  delayed steps are queued in the control spreadsheet's `PendingActions`
  tab and picked up by the `processPendingActions` time trigger (see step
  5 above) — so a delayed step can lag by up to ~10 minutes past its due
  time, not fire exactly on the second.
- `send_whatsapp` steps message the **agent's own** `Profile.whatsapp_number`
  (an internal "a lead just came in" ping), never the lead's phone number.
  If that field is empty, the step is skipped and logged rather than
  erroring — nothing blocks lead creation on a missing WhatsApp number.
- Each client's spreadsheet is fully separate — you (or they) can open it
  directly in Google Sheets at any time to see raw data, export, or filter.

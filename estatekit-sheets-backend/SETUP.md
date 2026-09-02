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
This just creates the `Accounts` and `PageIndex` tabs.

## 5. Deploy as a Web App
**Deploy → New deployment → gear icon → Web app**:
- Execute as: **Me**
- Who has access: **Anyone**
Click Deploy, copy the **Web app URL** — this is your API endpoint.

## 6. Wire the frontend
1. Copy every file from this bundle's `src/api/` into your repo's `src/api/`,
   overwriting the mock versions. Delete `src/api/_store.ts` — nothing else
   imports it once these are swapped.
2. Add a `.env` file at the repo root:
   ```
   VITE_API_URL=https://script.google.com/macros/s/XXXXXXXX/exec
   ```
3. `npm run dev` — you're live.

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
- `tier.set` is left in as a dev convenience (mirrors the original mock) —
  delete that case from `Code.gs`'s `route()` before you'd ever expose this
  to real paying-tier logic, since right now a client can grant itself paid
  tier by calling it directly.
- Each client's spreadsheet is fully separate — you (or they) can open it
  directly in Google Sheets at any time to see raw data, export, or filter.

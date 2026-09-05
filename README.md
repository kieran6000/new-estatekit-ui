# EstateKit — frontend mockup

Vite + React + TypeScript + React Router + MUI + TanStack Query. Same
UI/UX as [`web-react`](../web-react) (which is wired to a real Supabase
backend) and the `web/` vanilla prototype — old-Android/Material look,
"government-plain," no restyling. **This app is entirely frontend-only:
mock/local state, no backend, no API keys.** Every "table" lives in
`localStorage`, seeded on first load.

Use this repo for product demos, sales calls, and UI iteration without
touching the real backend in `web-react`.

Guiding rule for every screen: a non-tech 65-year-old agent uses this
with zero thinking. Fewer choices, fewer CTAs, no builders.

## Running it

```
npm install
npm run dev
```

Sign in with phone `+10000000000`, code `000000` (both pre-filled).

## Routes

**Dashboard (behind login, inside `AppShell`):** `/leads`, `/leads/:id`,
`/overview`, `/home`, `/lead-page`, `/upgrade`, `/admin/automations`.
Desktop gets the dark GHL-style rail, mobile gets the bottom nav. **Three
nav destinations, in this order: Leads · Home · My Page.** Overview is
reached only via the "Full numbers ›" link on Leads, not a nav item.
Automations is an operator-only route (gated by `useIsOperator`), never
in agent nav.

**Public (no login, not linked from anywhere in the dashboard —
reachable only by their own URL):**

- `/l/:leadId` — the page a WhatsApp lead-action link opens: read a
  lead's details, then Call / Change Stage at the bottom, same
  popup-after-call flow as the dashboard. See `LeadActionPage.tsx`.
# EstateKit

EstateKit is a Vite + React + TypeScript real-estate lead operations app.
It gives agents a simple way to manage leads, pipelines, branded lead-capture
pages, follow-up automations, sales reporting, and support.

This repository contains the current frontend, a local-storage mock API for
safe product demos, a Google Apps Script backend, and Supabase Edge Function
integrations. The frontend can be run without credentials; production mode
uses the typed API modules under `src/api/`.

## Quick start

Requirements: Node.js 20+ and npm.

```bash
npm install
npm run dev
```

Open the URL printed by Vite. The mock login uses phone `+10000000000` and
code `000000`; both are pre-filled in the login screen.

Available scripts:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run build` | Type-check and create the production build |
| `npm run lint` | Run Oxlint |
| `npm run preview` | Serve the production build locally |

There is no `npm run start` script in this Vite project.

## Product areas

- **Leads**: pipeline-aware lead list, lead detail, notes, stage changes,
  call workflow, and public lead-action links.
- **Pipelines**: seller and buyer presets with separate stages and outcomes.
- **My Page**: multiple branded lead-capture pages, fixed seller/buyer form
  templates, custom questions, thank-you screens, and Facebook Pixel settings.
- **Overview**: simple and advanced performance reporting.
- **Home**: course and learning links.
- **Automations**: operator-only WhatsApp automation management and previews.
- **Support and account**: support tickets, account settings, and tier flow.

## Routes

Authenticated dashboard routes include `/leads`, `/leads/:id`, `/overview`,
`/home`, `/lead-page`, `/upgrade`, and `/admin/automations`.

Public share routes are:

- `/l/:leadId`: lead-action page with Call and Change Stage actions.
- `/p/:pageId`: branded public lead-capture form and real form submission.

Vercel and other static hosts should rewrite all paths to `index.html`; the
included `vercel.json` provides that rewrite for Vercel.

## Local mock mode

The default API modules use browser `localStorage` seeded with demo data.
This makes the app safe for demos and UI work without touching production
data. Hooks and pages depend on typed functions in `src/api/`, so replacing
the mock implementations does not require changing the UI layer.

The dev tier toggle can switch between Free and Paid states. Paid mode gates
the custom-question editor; it is a demo control and is not a production
authorization mechanism.

## Google Sheets backend

`estatekit-sheets-backend/` contains a deployable Google Apps Script backend:

- `backend/Code.gs` is the API and automation worker.
- `src/api/*.ts` contains backend-connected API replacements with the same
  function signatures as the mock modules.
- Each client receives a separate spreadsheet with pipeline, lead-page,
  overview, automation, support, and profile tabs.

Follow [estatekit-sheets-backend/SETUP.md](estatekit-sheets-backend/SETUP.md)
to create the control spreadsheet, configure Script Properties, install the
time trigger, deploy the Apps Script web app, and connect the frontend.

The backend supports the development OTP number above without sending a real
message. Other phone numbers use the configured TextMeBot integration.

## Supabase integrations

The `supabase/functions/` directory contains Edge Functions for the Supabase
deployment path:

`create-agent`, `fb-ad-account`, `fb-ad-insights`, `fb-lead-webhook`,
`get-fb-form`, `list-fb-forms`, `panic-automations`, `sync-fb-leads`, and
`sync-pipeline-sheet`.

These functions cover agent creation, Facebook lead/form/ad integrations,
automation controls, and pipeline-sheet synchronization. Deploy and configure
them with the Supabase CLI and project secrets for the target environment.

## Environment variables

Copy `.env.example` to `.env` when using hosted services:

```dotenv
VITE_API_URL=https://your-api-endpoint.example.com
VITE_PUBLIC_POSTHOG_KEY=
VITE_PUBLIC_POSTHOG_HOST=
```

Do not commit `.env` or credentials. `VITE_*` values are exposed to the
browser, so only use public client configuration there.

## Project structure

```text
src/api/        Typed data-access modules
src/components/ Shared UI and workflow components
src/hooks/      Query, auth, tier, and realtime hooks
src/lib/        Formatting, stage, pixel, and form helpers
src/pages/      Route-level screens
src/types/      Shared TypeScript types
supabase/       Supabase Edge Functions
estatekit-sheets-backend/  Google Apps Script backend and API replacements
```

## Verification

Before pushing changes, run:

```bash
npm run lint
npm run build
```

The production build is written to `dist/`, which is generated output and is
not part of the source changes.

# EstateKit — frontend mockup

Vite + React + TypeScript + React Router + MUI + TanStack Query. Same
UI/UX as [`web-react`](../web-react) (which is wired to a real Supabase
backend) and the `web/` vanilla prototype — old-Android/Material look,
"government-plain," no restyling. **This app is entirely frontend-only:
mock/local state, no backend, no API keys.** Every "table" lives in
`localStorage`, seeded on first load.

Use this repo for product demos, sales calls, and UI iteration without
touching the real backend in `web-react`.

## Running it

```
npm install
npm run dev
```

Sign in with phone `+10000000000`, code `000000` (both pre-filled).

## Routes

`/login`, `/leads`, `/leads/:id`, `/overview`, `/home`, `/lead-page`,
`/upgrade`, `/admin/automations`, `/courses/:moduleId`. `AppShell` drives
navigation: desktop gets the dark GHL-style rail, mobile gets the bottom
nav. Two nav destinations (Leads, Home) — Overview is reached via the
Leads stat strip, not a nav item, matching the prototype.

## Tiers — Free vs Paid

A `tier: 'free' | 'paid'` flag (see [src/api/tier.ts](src/api/tier.ts))
gates three things only: locked course modules on Home, the custom
form-question editor on My Lead Page, and the nudges that route to
`/upgrade`. There's no shared-lead-pool / expiring-lead concept anywhere —
every lead belongs to the signed-in agent regardless of tier.

**Dev toggle:** a floating "DEV · TIER" pill (bottom-right, rendered by
[src/components/DevTierToggle.tsx](src/components/DevTierToggle.tsx)) lets
you flip Free/Paid from any screen to demo both. It's deliberately styled
as a debug overlay, not part of the app's real UI.

## `src/api/` — where the backend seams are

Every data access in the app goes through one of these typed modules.
Each function is a one-line `// TODO: connect backend` away from a real
implementation — swap the body, keep the signature, and the hooks/pages
above it need no changes.

| file | stands in for |
|---|---|
| `auth.ts` | WhatsApp-OTP request/verify + session (see `web-react`'s real implementation for the production flow) |
| `leads.ts` | `leads` table: list, stage/note updates, lead-page form submissions |
| `overview.ts` | `overview_daily` table |
| `setupSteps.ts` | `setup_steps` table |
| `support.ts` | `call_questions` insert, `send-ticket-email` edge function |
| `automations.ts` | `automations` / `automation_steps` tables + `agent_profiles.is_operator` |
| `tier.ts` | a real subscription/plan lookup |
| `leadPageConfig.ts` | per-agent lead-page config + the public form's submit handler |
| `customQuestions.ts` | per-agent custom form questions (paid tier) |
| `courses.ts` | a course/lessons CMS (static content, no per-agent mock editing needed) |

`src/api/_store.ts` is the only actually-mock piece — a generic
`localStorage`-JSON store all the above sit on. Delete it (and swap each
module's body) when wiring up a real backend; nothing else in the app
needs to change since hooks (`src/hooks/*`) and pages consume the `src/api/*`
function signatures, not `localStorage` directly.

## Notable differences from `web-react`

- No `@supabase/supabase-js` dependency, no `.env`, no keys.
- Auth is a mock: any session persists in `localStorage`, accepts only the
  fixed dev phone/code (mirrors `web-react`'s existing `dev_bypass` mode).
- "Launchpad" is renamed "Home" (`/home`); its course section is now
  "Guides" — a tier-gated module grid with a dedicated `/courses/:id` view.
- New: My Lead Page (`/lead-page`) — a config form + live preview of one
  fixed landing-page template, a mock public URL, and a downloadable QR
  code (via `qrcode.react`). Paid tier gets a custom-question list editor
  (label + type, add/edit/reorder/remove — no drag-and-drop, no template
  picker); free tier sees a lock + upgrade nudge instead.
- New: Upgrade screen (`/upgrade`) — free-vs-paid comparison, reachable
  from every lock/nudge.

## What's verified

Type-checks and builds clean (`npm run build`). Walked through in a
headless browser: login → Leads (stage-menu sub-steps with back button,
mobile card layout, focus-mode call flow) → Home (Guides grid, tier
toggle) → a course module → My Lead Page (live preview, QR, custom
questions for both tiers) → Upgrade → Overview → Admin Automations. No
console errors or failed network requests during that walkthrough.

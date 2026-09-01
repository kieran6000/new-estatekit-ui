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

`/login`, `/leads`, `/leads/:id`, `/overview`, `/home`, `/lead-page`,
`/upgrade`, `/admin/automations`. `AppShell` drives navigation: desktop
gets the dark GHL-style rail, mobile gets the bottom nav. **Three nav
destinations: Leads · My Page · Home.** Overview is reached only via the
"Full numbers ›" link on Leads, not a nav item. Automations is an
operator-only route (gated by `useIsOperator`), never in agent nav.

## Pipelines — Seller vs Buyer

Every lead belongs to a `Pipeline` (`src/api/pipelines.ts`), and every
pipeline is one of exactly two presets — there is no stage editor:

- **Seller-style**: New Lead → No Answer → Contacted → Booked → Mandate
  Signed → Lost / Invalid Number
- **Buyer-style**: New Lead → No Answer → Contacted → Viewing Booked →
  Offer Made → Bought → Lost / Invalid Number

A dropdown at the top of Leads switches between pipelines (default:
Seller). "+ Add pipeline" is tucked in that same menu — picking a preset
and naming it is the entire flow. Forms auto-route to a pipeline by lead
type (My Page's seller form always lands in the Seller pipeline) — there
is no manual "link pipeline" step anywhere. `OutcomeSheet`'s "how did it
go?" list and stage-menu contents are pipeline-aware (see
`MAIN_OUTCOME_OPTIONS` / `PIPELINE_STAGES` in
[src/lib/stageLogic.ts](src/lib/stageLogic.ts)) so Seller and Buyer leads
get correctly-worded outcomes from the same components.

## Tiers — Free vs Paid

A `tier: 'free' | 'paid'` flag (see [src/api/tier.ts](src/api/tier.ts))
gates exactly one thing now: the custom form-question editor on My Page
(and the `/upgrade` nudge that guards it). The course is plain Whop
outlinks with no locks. There's no shared-lead-pool / expiring-lead
concept anywhere — every lead belongs to the signed-in agent regardless
of tier.

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
| `pipelines.ts` | `pipelines` table + auto-routing a submission to the right one by lead type |
| `overview.ts` | `overview_daily` table (spend, leads, reach, appts, held, mandates, expected/earned commission) |
| `setupSteps.ts` | `setup_steps` table |
| `support.ts` | `call_questions` insert, `send-ticket-email` edge function |
| `automations.ts` | `automations` / `automation_steps` tables + `agent_profiles.is_operator` |
| `tier.ts` | a real subscription/plan lookup |
| `leadPageConfig.ts` | per-agent lead-page config + the public form's submit handler |
| `customQuestions.ts` | per-agent custom form questions (paid tier) |

`src/api/_store.ts` is the only actually-mock piece — a generic
`localStorage`-JSON store all the above sit on. Delete it (and swap each
module's body) when wiring up a real backend; nothing else in the app
needs to change since hooks (`src/hooks/*`) and pages consume the `src/api/*`
function signatures, not `localStorage` directly.

## Notable differences from `web-react`

- No `@supabase/supabase-js` dependency, no `.env`, no keys.
- Auth is a mock: any session persists in `localStorage`, accepts only the
  fixed dev phone/code (mirrors `web-react`'s existing `dev_bypass` mode).
- "Launchpad" is renamed "Home" (`/home`). Setup is a single "Your next
  step" card (one action + a thin progress bar), not a checklist. The
  course is a "Your course" Whop banner + a "Watch & learn" two-card grid
  — every card just opens a mock Whop URL in a new tab. No hosted player,
  no per-module locking.
- My Page (`/lead-page`) — a config form (including a custom-color
  swatch, not just presets) + a live multistep preview of one fixed
  landing-page template ("Step X of N", Next/Previous), a short mock
  public URL (`ek.co/p/...`) with Copy + native-Web-Share buttons. No QR
  code. Paid tier gets a custom-question list editor (label + type,
  add/edit/reorder/remove — no drag-and-drop, no template picker); free
  tier sees a lock + upgrade nudge instead.
- Overview (`/overview`) has a Simple ⇄ Advanced toggle. Simple is the
  day-to-day 7-column table; Advanced adds reach, show-rate, expected vs.
  actual commission, cost/mandate, profit and ROI (19 columns, horizontal
  scroll).
- Admin Automations (`/admin/automations`) renders a 1:1 WhatsApp chat
  bubble preview for every `send_whatsapp` step, merge fields filled from
  sample data, short lead-action link included (`ek.co/L/...`) — still a
  plain list/edit form underneath, no canvas.
- Upgrade screen (`/upgrade`) — free-vs-paid comparison, reachable from
  every lock/nudge.

## What's verified

Type-checks and builds clean (`npm run build`). Walked through in a
headless browser: login → Leads (pipeline switcher between Seller/Buyer,
add-pipeline dialog, stage-menu sub-steps with back button for both
pipelines, mobile card layout, focus-mode call flow) → Home (next-step
card, Whop course links) → My Page (multistep live preview, custom
accent color, share/copy, custom questions for both tiers) → Upgrade →
Overview (Simple/Advanced) → Admin Automations (WhatsApp preview). No
console errors or failed network requests during that walkthrough.

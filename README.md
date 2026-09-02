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
- `/p/:pageId` — the real page a "My Page" share link opens: the
  branded `LeadCaptureForm`, full-page, with a real (not demo) submit.
  Reachable from My Page's "Open live preview ↗" link. See
  `LeadPagePreviewPage.tsx`.

## Pipelines — Seller vs Buyer

Every lead belongs to a `Pipeline` (`src/api/pipelines.ts`), and every
pipeline is one of exactly two presets — there is no stage editor:

- **Seller-style**: New Lead → No Answer → Contacted → Booked → Mandate
  Signed → Lost / Invalid Number
- **Buyer-style**: New Lead → No Answer → Contacted → Viewing Booked →
  Offer Made → Bought → Lost / Invalid Number

A dropdown at the top of Leads switches between pipelines (default:
Seller). "+ Add pipeline" is tucked in that same menu — picking a preset
and naming it is the entire flow. `OutcomeSheet`'s "how did it go?" list
and stage-menu contents are pipeline-aware (see `MAIN_OUTCOME_OPTIONS` /
`PIPELINE_STAGES` in [src/lib/stageLogic.ts](src/lib/stageLogic.ts)) so
Seller and Buyer leads get correctly-worded outcomes from the same
components.

## My Page — one or more lead-capture pages, each feeding a pipeline

`/lead-page` supports **multiple pages** (`src/api/leadPages.ts`), each
with its own branding, switched via a dropdown at the top (same pattern
as the Pipelines switcher). "+ Add page" asks for a name and which
pipeline it feeds — that link is picked once at creation and never
edited in place; make a new page if leads need to go somewhere else.

Which pipeline a page feeds decides its one fixed template (no builder):
a Seller-linked page asks property address + timeline, a Buyer-linked
page asks area + budget (`src/lib/leadFormTemplate.ts`). Every
`LeadRow.source_page_id` records which page a lead came through, shown
as "Came from" on the lead-action page and lead detail — `null` for the
hand-seeded demo leads.

Per page, an agent controls: branding (name, headline, suburb, phone,
logo, accent color — pulled through into the form's header bar and
buttons), whether an intro/headline screen shows before Step 1, the
submit button's text, the thank-you headline/subtext shown after submit
(`{name}` is replaced with what the visitor typed), and a Facebook Pixel
ID field (mock only — nothing actually fires). Paid tier additionally
gets a custom-question editor; each custom question becomes its own
step, and multiple-choice/yes-no questions auto-advance on tap — no
"Next" click needed.

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
| `leads.ts` | `leads` table: list, stage/note updates, form-submission inserts |
| `pipelines.ts` | `pipelines` table |
| `leadPages.ts` | `lead_pages` table + a page's public-form submit handler (routes to its own `pipelineId`) |
| `customQuestions.ts` | per-page custom form questions (paid tier), scoped by `pageId` |
| `overview.ts` | `overview_daily` table (spend, leads, reach, appts, held, mandates, expected/earned commission) |
| `support.ts` | `call_questions` insert, `send-ticket-email` edge function |
| `automations.ts` | `automations` / `automation_steps` tables + `agent_profiles.is_operator` |
| `tier.ts` | a real subscription/plan lookup |

`src/api/_store.ts` is the only actually-mock piece — a generic
`localStorage`-JSON store all the above sit on. Delete it (and swap each
module's body) when wiring up a real backend; nothing else in the app
needs to change since hooks (`src/hooks/*`) and pages consume the `src/api/*`
function signatures, not `localStorage` directly.

## Notable differences from `web-react`

- No `@supabase/supabase-js` dependency, no `.env`, no keys.
- Auth is a mock: any session persists in `localStorage`, accepts only the
  fixed dev phone/code (mirrors `web-react`'s existing `dev_bypass` mode).
- "Launchpad" is renamed "Home" (`/home`). The course is a "Your course"
  Whop banner + a "Watch & learn" two-card grid — every card just opens a
  mock Whop URL in a new tab. No hosted player, no per-module locking, no
  setup-checklist gating.
- Overview (`/overview`) has a Simple ⇄ Advanced toggle. Simple is the
  day-to-day 7-column table; Advanced adds reach, show-rate, expected vs.
  actual commission, cost/mandate, profit and ROI (19 columns, horizontal
  scroll). Shows a skeleton while loading rather than a flash of zeros.
- Admin Automations (`/admin/automations`) renders a 1:1 WhatsApp chat
  bubble preview for every `send_whatsapp` step **without needing to
  expand the card** — merge fields filled from a real seeded lead, and
  the short lead-action link is a real, clickable `/l/:leadId` link, not
  decorative text. Expanding still gets you the plain edit form — no
  canvas.
- Upgrade screen (`/upgrade`) — free-vs-paid comparison, reachable from
  every lock/nudge.
- Empty/loading states are deliberately sparse, not decorative: a
  skeleton where a page would otherwise flash blank while its mock
  "query" resolves (Leads, My Page, Overview, the public lead-action
  page), and a plain-language empty message when a pipeline or filter
  has zero leads — nothing added where the UI is already self-evident.

## What's verified

Type-checks and builds clean (`npm run build`). Walked through end-to-end
in a headless browser, including cross-page effects: Leads (pipeline
switcher + add-pipeline, empty states, stage-menu sub-steps with back
button, mobile card layout, focus-mode call flow with Skip) → My Page
(multi-page switcher + add-page, per-page branding incl. accent-colored
header, multistep live preview with validation and auto-advance,
thank-you screen, "Open live preview" → `/p/:pageId` submitting a real
lead) → that lead showing up correctly in Leads and on its own
`/l/:leadId` page (CTAs at the bottom, correct "Came from" page
attribution) in a **separate, never-logged-in browser context** →
Overview (Simple/Advanced, sorting) → Admin Automations (always-visible
WhatsApp preview, clickable lead-action link) → Home → Upgrade. No
console errors, page errors, or failed requests anywhere in that pass.

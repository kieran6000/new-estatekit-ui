# EstateKit — System Reference

**Last verified against the live system: 25 Sept 2026.**
This file is the single reference for the EstateKit codebase, UI, database and
operations. It's written to be pasted into, or attached to, another Claude chat
or Project, so work can start without re-reading the code.

> **For a Claude reading this:** treat it as a map, not gospel. Numbers (row
> counts, which automations are on) drift. Before changing anything, check the
> file or table named here. The **rules** in §1, §3 and §13 are stable, so follow
> them.

---

## 0. Cheat sheet

| Thing | Value |
|---|---|
| App (live) | https://leads.estatekit.co |
| Public lead page | `https://leads.estatekit.co/p/<slug>` |
| WhatsApp action link | `https://leads.estatekit.co/l/<token>` |
| Repo | github.com/kieran6000/new-estatekit-ui (private) |
| Folder | `estatekit-app/web-react-mock` (the name is historical; it is the real app) |
| Supabase project | `yfcnsvrhojpysrzqrkdi` (EstateKit-Agent-App, eu-west-2) |
| Old Supabase project | `vatyiwyuuhvhdnhmbyyy` ("EstateKit", the old dashboard). Not this app. |
| Hosting | Vercel. `main` auto-deploys to production. Other branches get preview links. |
| Operator | Kieran, the only `is_operator = true` account. Logs in as phone `+264852878236`. |
| Build gate | `npx tsc --noEmit -p tsconfig.app.json` and `npm run build` must both pass |

**The rules that matter most:**
1. Users are **older, non-technical estate agents on phones who don't want to think.**
   Every UI decision serves that.
2. **One database, on purpose.** Test on a preview link, then merge `dev` into `main`.
   Migrations are **add-only**. See §3.
3. **Never show raw errors to users.** Plain English in the UI; technical detail in logs.
4. **Plain Material Design 2 ("ugly Android") look**, and consistent everywhere.
5. **Every edge function must check its caller** (a user, a share token, or a
   secret). §13 lists what's public and why.

---

## 1. Product and UX principles

**What it is:** a lead-management dashboard for South African estate agents. Ads
(Facebook instant forms, or EstateKit landing pages) produce leads. The agent gets
a WhatsApp alert with a one-tap link, calls, and logs what happened in two taps.
Automations follow up. Kieran runs it done-for-you: he sets up the agents, forms
and ads.

**Who uses it:**
- **Agents:** mostly on a phone, often older, non-technical. Use Leads, Forms,
  Account, and the WhatsApp action links.
- **Operator (Kieran):** everything, plus Overview, Automations, account
  switching, and cross-account search.

**UX rules (from Kieran, repeatedly):**
- **"Ugly simple native intuitive foolproof."** Stock MUI and Material Design 2:
  flat, 4px radius, thin dividers, UPPERCASE text buttons. No custom visual
  flourishes. Login and Welcome use plain MUI too.
- **Consistency is non-negotiable.** If a pattern exists anywhere, reuse it exactly:
  - colour picker: a circle swatch over a hidden `<input type=color>`
  - image upload: a dashed-border box with a `+`
  - autosave: 600ms debounce, no Save button, and "Saving… / Saved / Couldn't
    save — retry" feedback
- **Brain-dead simple beats flexible.** When a feature gets complicated, remove
  options rather than add controls. For example, form "bad answers" is a
  tick-list plus one choice, not per-answer routing. Kieran rejected branching
  logic, end pages and star ratings in turn.
- **Never guess-and-hope feedback.** Every action on the lead action page shows
  saving, saved or failed. Agents "use this page the most".
- **No raw errors.** No Graph error codes, token names, "non-2xx" or function
  names in the UI. Edge functions log details and return a stable code; the
  client maps it to friendly copy.
- **Sidebar active state** uses a neutral overlay, never MUI blue. Text colour on
  the sidebar is chosen by WCAG relative luminance (`src/lib/contrast.ts`,
  threshold 0.179), because the sidebar is white-labelled per agent.
- **Light mode only.**

---

## 2. Stack and repo layout

| Piece | What |
|---|---|
| Frontend | React 19, TypeScript, Vite (rolldown), MUI 9, React Router 7 |
| Data | TanStack React Query 5, Supabase JS 2 |
| Backend | Supabase: Postgres 17 + RLS, 32 Edge Functions (Deno), Vault, pg_cron, pg_net, Storage |
| Hosting | Vercel (SPA rewrite in `vercel.json`) |
| Analytics | PostHog, with all text and inputs masked (lead PII must never reach it) |
| Ops feed | Discord webhooks, via the `track-activity` edge function |
| WhatsApp | TextMeBot HTTP API, one account for all sends |
| Onboarding tour | driver.js |

```
src/
  main.tsx            providers: PostHog, Theme, React Query, Auth, Tier, Snack, Router, PreviewBanner
  App.tsx             routes + OperatorOnly / OnboardingGate guards
  theme.ts, index.css design tokens (see §7)
  types/index.ts      Stage, PipelineKind, PIPELINE_STAGES, stageLabel(), LeadRow, LeadPage, CustomQuestion
  api/                one module per domain; _client.ts owns the Supabase client + active-agent logic
  hooks/              React Query wrappers + auth/tier/snack contexts
  lib/                stageLogic (the SOP), pixel, attribution, tracking, contrast, format, tour
  components/         shared UI (see §5)
  pages/              one file per route (see §5)
supabase/
  functions/<name>/index.ts   every deployed edge function (32), source of truth
  migrations/                 dated, add-only SQL applied to production
  schema/2026-09-25_production_snapshot.sql   full structure snapshot. NEVER run it against prod.
SHIPPING.md                   how to ship safely (one database)
AUDIT-2026-09-25.md           security/bug audit + backlog
CAPI-SETUP.md                 Conversions API setup walkthrough
SPEC-multi-page-agents.md     agents with more than one Facebook page
deploy-functions.sh           old batch-deploy script (passes --no-verify-jwt to all; prefer per-function deploys)
```

Commands: `npm run dev`, `npm run build` (runs `tsc -b` + vite), `npm run lint` (oxlint).

---

## 3. Environments and shipping

**There is exactly one database (production), by Kieran's choice.** Safety comes
from:

1. **Preview links.** Work on the `dev` branch and push it. Vercel builds a
   private preview. It shows a yellow **"PREVIEW - live data. Clients can't see
   this link."** bar (`src/components/PreviewBanner.tsx`, driven by
   `VITE_VERCEL_ENV`, which Vercel sets automatically). It uses the **live
   database**, so test only on your own account and demo pages.
2. **Merging `dev` into `main` is the only moment clients see a change.** Kieran
   merges via a GitHub PR himself. Pushing to `main` directly is blocked for
   Claude, because it counts as a production deploy.
3. **Operator-only features:** `useOperatorPreview()`
   (`src/hooks/useOperatorPreview.ts`) returns true only for a signed-in operator.
   Use it to ship something live that only Kieran can see.
4. **Add-only migrations (expand/contract).** Old and new code share the
   database during a release. Add the new thing first; remove the old thing in a
   later, separate migration once the new code is live. Never rename or drop in
   the same release as the code change.
5. **Dry-run SQL on production inside `BEGIN; … ROLLBACK;`.** To prove RLS
   behaviour, probe as each role:
   `set local role anon;` or
   `select set_config('request.jwt.claims','{"sub":"<uuid>","role":"authenticated"}',true); set local role authenticated;`
6. **Edge functions have no preview.** A deploy is live instantly. Deploy one at a
   time:
   `npx supabase functions deploy <name> --project-ref yfcnsvrhojpysrzqrkdi --use-api`
   (add `--no-verify-jwt` only for functions that must be public).
   **A deploy keeps the function's existing `verify_jwt` setting.**
   Roll back by redeploying the previous version from git.
7. **Never edit functions in the Supabase dashboard.** On 25 Sept, 12 live
   functions existed only there. All 32 are now in `supabase/functions/`.

Tools available to Claude: the Supabase MCP (`execute_sql`, `apply_migration`,
logs, advisors, edge functions), the Meta Ads MCP, and the Supabase CLI (logged in
and linked; `supabase db query --linked` works, but `db dump` needs Docker, which
isn't installed).

---

## 4. Domain model

A **lead** belongs to an **agent** and sits in a **pipeline**. A pipeline's
**kind** fixes its stage list. There's no custom-stage editor.

| Kind | Stages | Wins |
|---|---|---|
| `seller` | New Lead, No Answer, Contacted, **Booked**, **Mandate Signed**, Lost, Invalid Number | Mandate Signed |
| `buyer` | New Lead, No Answer, Contacted, **Viewing Booked**, **Offer Made**, **Bought**, Lost, Invalid Number | Bought |
| `general` | same stored stages as seller, **displayed** as "Meeting booked" and "Signed up" (`stageLabel()`) | Signed up |

`general` exists for recruitment and other non-property funnels (Bennie's Dubai
recruitment uses it). It has no commission step, and the Overview excludes it.

**Derived states** (`src/types/index.ts`, `src/lib/stageLogic.ts`):
- `due`: needs action today. Drives the call list.
- **Dead:** Lost, Invalid Number. No call button; excluded from lists.
- **Parked:** Booked, Mandate Signed, Viewing Booked, Offer Made, Bought. Sorted
  below active work.

**The SOP lives in one place: `computeStagePatch()` in `src/lib/stageLogic.ts`.**
Changing a stage applies this patch:

| New stage | `due` | `next_label` | `reminder_at` |
|---|---|---|---|
| New Lead | true | "Just came in" | — |
| No Answer | true | "Retry today" | now |
| Contacted / Offer Made | false | "Follow up in 2 days" (or chosen) | +2 days (or chosen) |
| Booked / Viewing Booked | false | "Appt <date>" or "Appt set" | the appointment time |
| Mandate Signed / Bought | false | "—" | — (+ `commission` if given) |
| Lost / Invalid Number | false | "—" | — |

**The "How did it go?" options** (`MAIN_OUTCOME_OPTIONS`) differ per kind. For
seller: Booked an appointment, Spoke — following up, No answer, Signed the
mandate, Not selling, Wrong number. Some outcomes then ask a follow-up step
(`stepForStage`):
- Booked → **"When is it?"** (Today / Tomorrow 9am / Tomorrow 2pm / pick a time)
- Contacted → **when to follow up**
- Mandate or Bought → **commission amount** (skipped for `general`)

**Commission:** a signed mandate counts as *expected* commission.
It becomes *earned* only when `commission_received_at` is set.

**Lead quality:** `leads.quality` is `good` or `weak`. `weak` comes from a form
answer listed in `custom_questions.low_quality_answers`. Weak leads still reach
the agent but are **never reported to Facebook as conversions** (pixel
conditioning).

---

## 5. The UI, screen by screen

### Navigation (`src/components/AppShell.tsx`)
- **Desktop:** a left rail with Leads and Forms; an admin section (operator only)
  with Overview, Clients and Automations; account at the bottom. The rail background is
  the agent's `sidebar_color`, with their `sidebar_logo_url` (white-labelling).
  Text contrast is computed by luminance.
- **Mobile:** a bottom nav with Leads, Forms, Overview and Clients (operator only) and Account.
- **Account switcher** (`AccountSwitcher.tsx`, operator only): act as any agent.
  Stored in memory plus a localStorage key **scoped to the real user id**.
  Everything is cleared on any auth change, along with the React Query cache.
  A shared key once leaked one account into another's session. Don't regress
  this.

### Routes

| Route | Page | Access |
|---|---|---|
| `/login` (and `*` when signed out) | LoginPage: phone + password | public |
| `/welcome` | WelcomePage: first-run confirm details + set password | signed in, not onboarded |
| `/leads` | LeadsPage | signed in |
| `/leads/:id` | LeadDetailPage | signed in |
| `/lead-page` | LeadPagePage ("Forms") | signed in |
| `/account` | AccountPage | signed in |
| `/upgrade` | UpgradePage | signed in |
| `/overview` | OverviewPage | **operator** (route guard) |
| `/admin/clients` | ClientsPage: every client as a card | **operator** (route guard) |
| `/admin/clients/:agentId` | ClientDetailPage: one client's full record | **operator** (route guard) |
| `/admin/automations` | AdminAutomationsPage | **operator** (in-page guard) |
| `/home` | HomePage | dev builds only |
| `/l/:token` | LeadActionPage: WhatsApp action link | **public**, via token |
| `/p/:slug` | LeadPagePreviewPage: the live landing page | **public** |
| `/thank-you` | ThankYouPage | public |
| `/privacy` | PrivacyPolicyPage | public |
| `/start` | SignupPage: request a free account (from "Powered by EstateKit") | public |

`OnboardingGate` sends not-yet-onboarded users to `/welcome`. It checks the
**logged-in** user, not the account being viewed.

### Leads (`/leads`, `src/pages/LeadsPage.tsx`)
The agent's home screen.
- **Pipeline switcher:** tabs/menu per pipeline. Add pipeline (Seller-style /
  Buyer-style / General) and rename.
- **Call list band:** the `due` leads (`dueLeads()`). Opens **Focus mode**
  (`FocusCallModal.tsx`), a frozen, one-lead-at-a-time calling flow. The list
  is deliberately not recomputed while open.
- **List:** a table on desktop (`LeadsTable`), cards on mobile
  (`MobileLeadsList`). Sorted by `sortLeadsForList()`.
- **Select mode (bulk):** archive/restore, move stage, move to another pipeline.
- **Archived view:** operator only.
- **Search:** operators can search across all accounts (`searchLeadsEverywhere`).
- **Getting started checklist** (`GettingStarted.tsx`) at the top of Leads.
  - It has 7 items, each ticked automatically from real data: account created
    (always ticked), tour taken, photo, logo, Facebook page connected, first
    lead, first call.
  - Each open item is one tap to where it gets done. "Connect Facebook" opens a
    pre-filled WhatsApp to the admin, because Facebook settings are
    operator-only.
  - It starts expanded while less than 60% is done, and hides itself when
    complete or when the agent taps "Hide this" (stored per agent in
    localStorage).
  - PostHog tracks `checklist_viewed`, `checklist_item_clicked`,
    `checklist_hidden` and `checklist_completed`.
- **"How it works" tour** (`lib/tour.ts` + `tour.css`, driver.js, EstateKit-styled):
  - Structure: a welcome card (Show me / Skip), then lists, filters, open a
    lead and call, ending on "Start calling".
  - It auto-offers once per agent per device (key `estatekit_tour_leads_v2_<id>`),
    never auto-starts for operators, and replays from the **?** button.
  - Steps for elements that aren't on screen are dropped, and a tap on the dark
    backdrop doesn't close it.
  - PostHog tracks `tour_started`, `tour_step_viewed`, `tour_completed` and
    `tour_dismissed` (with the step they left on), with `auto` telling
    first-run from replay.
- A reload button. Realtime refresh via
  `useRealtime`.
- Free tier: phone numbers masked (`useCanSeeFullPhone()`; operators and paid
  tiers see full numbers).

### Lead detail (`/leads/:id`, `LeadDetailPage.tsx`)
Sections: **Contact**; **From their form** (`form_answers`); **Came from**
(landing-page attribution: utm, fbclid, ad id) or **Came from this ad** (the
creative, via `fb-lead-source-ad`); **Notes**; **Commission** (with a
"received" toggle); **History** (operator: `LeadHistory.tsx` from
`lead_events`, showing who, what and on which device); a **Pipeline** selector.

### Lead action page (`/l/:token`, `LeadActionPage.tsx`), the most-used screen
What the WhatsApp link opens. **Works signed out**: the token authorises one
lead.
- Loads via the `get_shared_lead(token)` RPC (one lead, token checked
  server-side). Tokens are 8 hex characters (old links) or 32 (since 25 Sept).
  `isTokenFormat()` accepts both.
- Big **Call them** and **WhatsApp** buttons, a banner for any upcoming
  appointment, and **Add a note**.
- **"What happened?"** opens `OutcomeSheet.tsx`, then the follow-up step
  (`WhenIsItStep` for appointments), then `LoggedConfirmation`, which shows
  saving, saved or failed.
- Writes go through the edge functions `log-outcome`, `lead-note` and
  `lead-call` (token-authorised).
- `/l/<uuid>` for signed-in users falls back to the authenticated view.

### Forms (`/lead-page`, `LeadPagePage.tsx`, ~1,500 lines)
One screen manages all of an agent's **lead sources**.
- **Source picker plus "Add lead source"** (`AddPageDialog`): a **Website** landing
  page, or a **Facebook instant form**. Pick the pipeline it feeds. The Facebook
  form list comes from `list-fb-forms`. **"Use a different page"**
  (`FbPagePicker`) handles forms on a second Facebook page; see
  `SPEC-multi-page-agents.md`.
- **Website source:**
  - **Page details:** agent name, headline, suburb, phone, logo, profile photo,
    accent colour, intro screen on/off, collect email, name/phone field wording,
    CTA text, thank-you headline and subtext. Autosaves.
  - **Form questions** (`CustomQuestionEditor`): types `short_text`, `address`,
    `multiple_choice`, `yes_no`; required; reorder; helper text. **Bad answers:**
    tick the answers that are bad, then one choice: *turn them away*
    (`disqualify_answers`, no lead created) or *keep but don't count*
    (`low_quality_answers`, a weak lead not reported to Facebook). Adding
    questions beyond the defaults is a **paid-tier** feature (`UpgradeNudge`).
  - **Recent sales** (`RecentSalesEditor`): social-proof listings marked
    `sold` or `listed`.
  - **Advanced tracking:** Facebook Pixel ID; **Conversions API** settings
    (`CapiSettings`: access token, test mode / test event code).
  - **Live preview** (`PreviewAndSubmit`) and a share link.
  - **Page performance** (operator only, `LeadPageFunnelStats.tsx`): views, started,
    contact, opt-ins, disqualified.
- **Facebook form source** (`FbFormSource`): a phone-style preview of the Meta form
  (`FbFormPreview.tsx`) and the pipeline it feeds.

### Public landing page (`/p/:slug`, `LeadPagePreviewPage.tsx` + `LeadCaptureForm.tsx`)
The one fixed template: a branded header (logo on the accent colour), an
optional intro screen, **one question per step**, then contact details (name,
optional email, WhatsApp number). A disqualifying answer shows a polite
"not a fit" screen and creates no lead.
- On load: the Facebook Pixel (`lib/fbPixel.ts`), funnel `view` tracking, and
  attribution capture from the URL (`lib/adAttribution.ts`: utm, fbclid, Meta
  macros).
- On submit: a `Lead` pixel event (only for good leads), then navigate to
  `/thank-you` **immediately**. The save (`public-submit-lead`) and the
  Conversions API call (`fb-capi-lead`, same `event_id` for dedupe) happen in
  the background.
- The thank-you screen shows the profile photo, the headline, and the recent
  sales list.
- The consent line ("By submitting this form…") shows **only on the contact
  step**, under the submit button. It's `ContactConsent` in `LeadCaptureForm`.
- **"Powered by EstateKit"** (`PoweredByEstateKit.tsx`) sits at the bottom of the
  lead page (faint, logo only) and the thank-you page (adds "Estate agent? Get
  leads like this in your area, free →"). It opens `/start?from=…&ref=<slug>`
  in a **new tab**, so a homeowner never loses a half-filled form.

### Sign-up (`/start`, public, `SignupPage.tsx`)
A free-account request form in the lead-page style, built for completion
rate. Each step has an icon, and every single-choice step moves on by itself.
1. **What do you want more of?** Sellers / Buyers / Both / Agents to recruit
   (one tap).
2. **City or town:** popular cities to tap, or autocomplete (one tap). Used for
   broad call-outs in the creative ("Selling in Centurion?").
3. **Up to 5 suburbs:** tappable "Near <city>" suggestions, plus autocomplete
   biased to that city. Anything can also be typed and added.
4. **Monthly ad budget** (one tap).
5. **Agency.**
6. **Name, email, WhatsApp.**

City and suburb lookups use **Photon** (photon.komoot.io, free OpenStreetMap
search), in `src/lib/places.ts`. Every lookup is best-effort: if Photon is
down, people just type.

- **Saving:** through the `request_signup` RPC. A database trigger then calls
  the `notify-signup` function, which sends the **admin a WhatsApp**
  (TextMeBot) and a **Discord card**. The card goes to the vault secret
  `DISCORD_SIGNUP_WEBHOOK`, falling back to `DISCORD_ACTIVITY_WEBHOOK`. Each
  request is announced once (`notified_at`).
- **Done screen:** a "Message us on WhatsApp" button with every answer
  pre-filled. It's also the fallback if the save fails.
- **On the Clients page:** new requests appear at the top
  (`SignupRequests.tsx`), with a WhatsApp button (a tap marks them
  contacted), **Signed up** and **Not a fit**.
- **Left for onboarding:** Facebook access, photos, recent sales, price range
  and no-go suburbs.

### Overview (`/overview`, operator only, `OverviewPage.tsx`)
Per-agent performance: Simple or Advanced views, a sortable table ("Tap a
heading to sort") with a sticky totals row, a date range, an ad spend/billing card
(`AdSpendCard.tsx` via `fb-ad-account`), and an **Active ads** panel
(`ActiveAds.tsx` via `fb-active-ads`: creative, spend, leads, CPL, health dot,
**pause/resume switch** via `fb-set-ad-status`). Computed client-side in
`hooks/useOverview.ts`. General pipelines are excluded.

### Clients (`/admin/clients`, operator only, `ClientsPage.tsx` + `ClientDetailPage.tsx`)
A directory of every client account (the operator's own is left out). It is
deliberately **not** a CSM tool: ad performance, reviews and check-ins live in
app.estatekit.co, so they don't appear here.
- **Table:** a row per client with picture and name, agency, area, leads
  (30 days), **CPL (30 days)** and last lead. Every column sorts (tap the
  heading again to flip it), and blanks always sink to the bottom. The sort is
  remembered. On a phone, agency and area fold under the name. CPL is live:
  30-day Meta spend (`fb-ad-insights`, one call per ad account, cached 30 min)
  divided by 30-day leads. Search matches name, agency, area, email and phone.
- **Detail page:** one page, no tabs. The header has the photo and quick
  actions (**Open their dashboard** switches the account switcher to them,
  WhatsApp, Call, Email). Below that: lead KPIs (7 days, 30 days, CPL, all
  time, last lead, lead sources), then two independent columns:
  - **Left:** Leads by stage, then the onboarding answers.
  - **Right:** Contact, Package & billing, and Account.
- **Editing (operators):** each section has **Edit**, which turns it into a
  form with Save and Cancel. Click the photo to replace it. Account has an
  automations on/off switch that saves straight away.
  - Name, agency, area, WhatsApp, email, ad account, page ID and the photo are
    written to `agent_profiles`, so they show everywhere, including the
    client's own dashboard.
  - Everything else is merged into the `client_dossiers` row.
  - Changing WhatsApp changes where alerts go, **not** their login number.
- **Data:** live numbers come from `client_directory()`. Contact, billing and
  onboarding come from the `client_dossiers` row, compiled once on 25 Sept 2026
  from the CSM and Metrics sheets and the old platform's data. The row also
  holds calls, feedback and ad history, which the page doesn't show.
  **It's a snapshot; the sheets don't sync into it.**

### Automations (`/admin/automations`, operator only)
Automation cards with enable toggles and a step editor (delay in minutes after
the previous step, WhatsApp template). **Scheduled** tab
(`ScheduledAutomations.tsx`): every queued run for the account, with a
**WhatsApp preview** (`WhatsAppPreview.tsx`). Double-click to edit a single run's
wording (`template_override`). A per-account pause, a **panic stop**
(`panic-automations`), an all-accounts view, and the end-of-day digest setup.

### Account (`/account`, `AccountPage.tsx`)
Full name, email, WhatsApp number, area, company, FB Page ID, FB Ad Account ID,
renewal date, logo, profile photo (separate from the logo), accent colour,
contract PDF. Operator extras: **agent passwords** (`AgentPasswords.tsx` via
`admin-set-password`). `DevTierToggle` is demo-only.

---

## 6. Frontend code map

**`src/api/`** (one module per domain; all Supabase calls live here):

| Module | Main functions |
|---|---|
| `_client.ts` | Supabase client; `getActiveAgentId()`, `setActiveAgent()`, `restoreActiveAgent()`, `listAgentProfiles()` |
| `auth.ts` | `signIn` (phone becomes `<digits>@estatekit.app` + password), `signOut`, `updatePassword` |
| `leads.ts` | `listLeads`, `updateLead`, `bulkUpdateLeads`, `moveLeadToPipeline`, `setLeadArchived`, `setCommissionReceived`, `searchLeadsEverywhere`, `getLeadSourceAd` |
| `leadActions.ts` | `getLeadByToken` (RPC `get_shared_lead`), `logOutcomeByToken`, `saveNoteByToken` |
| `leadEvents.ts` | `listLeadEvents`, `logLeadCall`, `logCallByToken` |
| `leadPages.ts` | `listLeadPages`, `addLeadPage`, `updateLeadPage`, `deleteLeadPage`, `getLeadPageBySlug`, `listFbForms`, `getFbForm`, `listFbPages`, `syncFbLeads`, `getLeadPageFunnel`, `submitMockLead` (the real public submit), `reportCapiLead` |
| `customQuestions.ts` | list/add/update/remove/move questions; `listCustomQuestionsPublic` |
| `pipelines.ts` | `listPipelines`, `addPipeline`, `renamePipeline`, `getPipelinePublic`, `syncPipelineSheet` |
| `agentProfile.ts` | `getMyProfile`, `upsertProfile`, `getActiveAds`, `setAdStatus`, `getFbAdInsights`, `getFbAdAccount`, `setAgentPassword`, `amIOnboarded` |
| `automations.ts` | `getIsOperator`, automations/steps CRUD, `listScheduledRuns`, `updateScheduledRun`, account pause, `panicStopAutomations` |
| `capi.ts` | `getCapiConfig`, `saveCapiConfig`, `listCapiEvents` |
| `soldListings.ts` | per-agent listings (note: keyed by **agent**, not page) |
| `support.ts`, `tier.ts`, `overview.ts` | tickets, free/paid, legacy daily table |

**`src/hooks/`:** `useAuth` (session; clears the query cache on user change),
`useTier` (`useCanSeeFullPhone`), `useLeads`, `useLeadPages`, `usePipelines`,
`useCustomQuestions`, `useAutomations` (`useIsOperator`, which checks the **real**
user), `useOverview`, `useRealtime`, `useSnack`, `useSupport`,
`usePageviewTracking`, `useOperatorPreview`.

**`src/lib/`:** `stageLogic` (the SOP), `fbPixel`, `adAttribution`,
`pageTracking`, `activity` (Discord/PostHog), `contrast`, `format`
(`maskPhone`, `prettyAnswer`), `timeAgo`, `pendingCall`, `tour`,
`leadFormTemplate`, `deployEnv`, `queryClient` (staleTime 15s, refetch on focus,
retry 1).

**Patterns to follow:**
- React Query for all server state. Optimistic updates must roll back on error.
- An operator acting as an agent: always resolve the target via
  `getActiveAgentId()`, never `auth.uid()`, for data. For "am I an operator",
  use the real user.
- `select("*")` for reads that must survive new columns. Explicit column lists
  400 when a column doesn't exist yet, which bit us when UI shipped ahead of its
  migration.
- Friendly error copy only (§1).

---

## 7. Design system

`src/theme.ts` + `src/index.css` (CSS variables). Light only.

| Token | Value | Use |
|---|---|---|
| `--ek-primary` | `#1976d2` | MUI blue, primary actions |
| `--ek-primaryDark` | `#1565c0` | |
| `--ek-primaryBg` | `#e8f0fe` | tinted backgrounds |
| `--ek-green` / `--ek-greenCall` | `#2e7d32` / `#43a047` | success / call buttons |
| `--ek-red` | `#c62828` | errors, destructive |
| `--ek-amberTint` | `#fff8e1` | due / attention |
| `--ek-bg` | `#f1f3f4` | page background |
| `--ek-surface` / `--ek-surface2` | `#ffffff` / `#eef1f3` | cards |
| `--ek-divider` / `--ek-divider2` | `#e0e0e0` / `#eeeeee` | |
| `--ek-ink` / `ink2` / `ink3` | 87% / 60% / 38% black | text |
| rail (default) | `#1b2431` | sidebar when the agent has no colour |

Typography: Roboto, 14px base, UPPERCASE buttons (500, 0.06em). Radius 4px,
chips 16px. No elevation on buttons. AppBar: white with a bottom divider. Public
lead pages use the agent's `accent_color` for the header and buttons.

---

## 8. Database

26 tables in `public`, all with RLS. The full DDL is in
`supabase/schema/2026-09-25_production_snapshot.sql`. Roughly: 1,211 leads,
35 agent profiles (21 of them switched-off imports from the old dashboard, see
§14), 18 lead pages, 75 pipelines.

| Table | Purpose / key columns |
|---|---|
| `leads` | The product. `agent_id, pipeline_id, source_page_id, name, phone, email, stage, next_label, reminder_at, due, form_answers jsonb [{q,a}], note, commission, commission_received_at, archived, fb_lead_id (unique), fb_ad_id, attribution jsonb, quality ('good'\|'weak')` |
| `agent_profiles` | One per user (`agent_id` = auth uid). `display_name, whatsapp_number (store 27…), email, area, company, is_operator, tier, onboarded, automations_paused, fb_ad_account_id (digits), fb_page_id, sidebar_color, sidebar_logo_url, avatar_url, billing_type, adspend_balance, renewal_date, contract_pdf_url` |
| `pipelines` | `agent_id, name, kind ('seller'\|'buyer'\|'general'), sheet_url` |
| `lead_pages` | A lead source. `slug, name, pipeline_id, source_type ('website'\|'fb_form'), fb_form_id, fb_form_name, fb_page_id` (the page the form lives on; null = the agent's own), copy fields, `accent_color, logo_data_url, profile_photo_data_url` (**base64 in the row**, which makes it heavy), `show_intro, collect_email, fb_pixel_id` |
| `custom_questions` | The form body. `page_id, label, type, options jsonb, helper_text, required, is_default, sort_order, disqualify_answers text[], low_quality_answers text[]` |
| `sold_listings` | Social proof. `agent_id, address, price, image_url, status ('sold'\|'listed'), sort_order`. **Per agent**, so it shows on all of the agent's pages. |
| `lead_share_tokens` | `token` (unique; 8 or 32 hex), `lead_id, agent_id, link_type, expires_at`. Minted for website leads (24h), automation WhatsApps (7d) and Discord cards (30d). |
| `lead_events` | Lead history: `event_type, from_value, to_value, source, actor_id, device`. Written by triggers; attribution headers are trusted from the service role only. |
| `lead_page_events` | Funnel: `view, start, contact, disqualified, submit` per `session_id`. |
| `automations` / `automation_steps` / `automation_runs` | See §10. |
| `agent_daily_nudges` | One row per agent per day the end-of-day digest was sent. |
| `fb_capi_config` | Per pixel: `access_token, enabled, test_event_code`. (0 configured as of 25 Sept.) |
| `fb_capi_events` | Conversions API send log (dedupe on `event_id`). |
| `fb_form_cache` | Cached Facebook form definitions (quota protection). |
| `fb_page_tokens` | Cached page access tokens. Deny-all RLS; service role only. |
| `fb_api_state` | A single row: `backoff_until`, the app-wide Facebook rate-limit circuit breaker. |
| `setup_steps` | Per-agent onboarding checklist (seeded by a trigger on `auth.users`). |
| `support_tickets`, `call_questions` | Support inbox, agents' questions. |
| `signup_requests` | Free-account requests from `/start`: `name, whatsapp (+27…), email, agency, wants text[], city, suburbs, budget, ref, notified_at` (lead page slug), `source` (`lead_page`|`thank_you`), `status` (`new`|`contacted`|`signed_up`|`not_a_fit`). Operators read/update; the public only via `request_signup`. |
| `client_dossiers` | **Operator only.** One row per client: `agent_id` (pk), `data jsonb` (the Clients tab's record, see §5), `updated_at`. Agents can't read their own. |
| `overview_daily` | **Legacy / empty.** The Overview is computed client-side now. |
| `otp_codes`, `phone_otp_codes` | Legacy WhatsApp-code login. **Disabled** (§13). |

**Database functions:**

| Function | Notes |
|---|---|
| `is_operator()` | SECURITY DEFINER; returns the **caller's own** flag (false for anon). Used by most policies. Leave anon's EXECUTE; revoking breaks anon reads. |
| `get_secret(name)` | Vault reader. **service_role only.** Never grant to anon or authenticated. |
| `get_shared_lead(token)` | SECURITY DEFINER; the one-lead read for `/l/<token>`. anon + authenticated. |
| `enqueue_automations()` | Trigger on `leads`: queues runs (see §10). |
| `record_lead_event()` | Trigger on `leads`: writes history. |
| `dedupe_lead_call()` | Trigger on `lead_events`: collapses repeat call logs. |
| `request_signup(...)` | SECURITY DEFINER, anon + authenticated. Validates (incl. email) and caps every field, normalises the number to +27…, and returns the existing request for a repeat from the same number within 24h. |
| `client_directory()` | Live per-account lead counts (7d/30d/total/last/by stage), lead pages and pipelines for the Clients tab. SECURITY INVOKER, and it returns nothing unless the caller is an operator. |
| `lead_page_funnel(page_id, since)` | Funnel counts (SECURITY INVOKER, so it respects RLS). |
| `find_user_id_by_phone(phone)` | service_role only. |
| `seed_setup_steps()` | Trigger on `auth.users`. |
| `set_updated_at()`, `refresh_overview_daily()` | The second is dead code. |

**Cron (pg_cron, calls edge functions via pg_net):**

| Job | Schedule (UTC) | Does |
|---|---|---|
| `run-automations-every-minute` | `* * * * *` | the automation engine |
| `sync-fb-leads-every-5-min` | `*/15 * * * *` (the name is wrong; it runs every 15 min) | polls Facebook instant forms, `sinceDays: 3`, `includePageForms: true` |
| `daily-stage-nudge-weekdays` | `0 14 * * 1-5` (16:00 SAST) | the EOD digest. **Inactive.** |

pg_net's 5s timeout means cron responses are often recorded as timed out, but the
functions still complete.

**Storage:** the `logos` bucket (public read; writes need a signed-in user),
which holds agent logos, avatars, sale photos and contract PDFs.

---

## 9. Edge functions (all 32)

`JWT` = gateway `verify_jwt`. Remember that the public anon key *is* a valid JWT,
so `JWT on` alone doesn't mean "signed in". **Auth** is what the function itself
checks.

**Lead intake**

| Function | JWT | Auth | Does |
|---|---|---|---|
| `public-submit-lead` | off | public by design | Website form submit: inserts the lead (with quality and attribution), mints a 24h token, notifies |
| `sync-fb-leads` | off | none (cron) ⚠ | Polls linked instant forms; inserts one row at a time (duplicates rejected by the unique `fb_lead_id`) |
| `fb-lead-webhook` | off | verify token on subscribe only; POSTs **not** signature-checked (it re-fetches each lead from Graph by id, so data can't be forged) | Meta webhook receiver (the poll is the real safety net) |
| `new-lead-webhook` | off | `X-Webhook-Secret` | External lead intake |
| `fb-capi-lead` | off | needs a lead UUID | Conversions API send; skips weak leads; dedupes on `event_id` |
| `track-page-event` | off | public by design | Funnel events |

**Facebook / Meta**

| Function | JWT | Auth | Does |
|---|---|---|---|
| `list-fb-forms` | off | none ⚠ | A page's lead forms (cached; needs a page token) |
| `get-fb-form` | off | none ⚠ | One form's questions (cached; `force` skips the cache) |
| `discover-fb-pages` | on | none ⚠ | Every page and ad account the tokens see (names and ids only). Powers the page picker. |
| `fb-active-ads` | off | **operator or owner** | Ad cards + per-ad spend and leads |
| `fb-ad-insights` | on | **operator or owner** | Daily spend series |
| `fb-ad-account` | on | **operator or owner** | Balance, spend cap, funding |
| `fb-set-ad-status` | off | **operator or owner** (checked with Graph) | Pause or resume an ad |
| `fb-lead-source-ad` | off | needs a lead UUID | Which ad or creative a lead came from |

**Agent actions (share-token authorised)**

| Function | JWT | Auth | Does |
|---|---|---|---|
| `log-outcome` | off | token | Stage change from `/l/` (+ appointment `at`) |
| `lead-note` | off | token | Save a note |
| `lead-call` | off | token | Log a call |

**Admin / ops**

| Function | JWT | Auth | Does |
|---|---|---|---|
| `create-agent` | on | operator | Auth user + profile + Seller & Buyer pipelines |
| `admin-set-password` | off | operator (checks the JWT itself) | Set an agent's password |
| `panic-automations` | on | operator | Disable all automations and cancel queued runs |
| `run-automations` | off | none (cron) ⚠ | The automation engine (§10) |
| `daily-stage-nudge` | off | none; no-op while disabled | EOD digest |
| `daily-reminders` | on | service-role key | Old daily WhatsApp roll-up (not scheduled) |
| `track-activity` | off | public | Discord activity embeds (+ PostHog replay links) |
| `send-ticket-email` | on | user | Support tickets to Discord |
| `sync-pipeline-sheet` | on | user | Google Sheet export (unused: 0 pipelines) |

**Disabled stubs (return 410):** `verify-whatsapp-otp`, `request-whatsapp-otp`,
`temp-onboard-one`, `temp-fb-lookup`, `temp-send-whatsapp`,
`temp-fb-token-check`. Candidates for deletion.

⚠ = open to anyone (see §13 and the audit, item 5).

---

## 10. Automations and WhatsApp

`automations` (the trigger) → `automation_steps` (ordered actions, with delays) →
`automation_runs` (the queue: `pending`, `processing`, `completed`, `paused` or
`cancelled`).

- **Triggers:** `lead_created`, `stage_changed` (+ `trigger_stage`), `daily_digest`.
- **Actions:** `send_whatsapp`, `set_reminder`, `set_stage`.
- **Queueing** (`enqueue_automations` trigger): `lead_created` only fires if the
  lead's `created_at` is **within 30 minutes** (so backfills and imports never
  alert). Stage changes always queue. A partial unique index stops duplicate
  pending runs per lead and automation.
- **Messages go to the agent about their lead, never to the lead.**

**Current automations (25 Sept):**

| Automation | Trigger | Steps | On |
|---|---|---|---|
| New lead — instant agent ping | lead_created | WhatsApp now | ✅ |
| No Answer — retry nudge | → No Answer | WhatsApp +4h | ✅ |
| Contacted — follow-up sequence | → Contacted | +2d, then +3d | ✅ |
| Booked — appt reminder + did-they-sign nudge | → Booked | +1d, then +3d | ✅ |
| Mandate Signed — confirmation | → Mandate Signed | now | ✅ |
| Offer Made — follow-up | → Offer Made | now, then +2d | ❌ |
| Viewing Booked — prep reminder | → Viewing Booked | +1d, then +3d | ❌ |
| Daily — leads still to update | daily_digest | 16:00 SAST weekdays | ❌ |

**Template variables:** `{{name}}`, `{{first_name}}`, `{{phone}}`, `{{stage}}`,
`{{next_label}}`, `{{action_link}}`. The last one mints a 7-day, 32-char share
token and becomes `https://leads.estatekit.co/l/<token>`.

**Engine behaviour** (`supabase/functions/run-automations/index.ts`):
- **Quiet hours:** follow-ups only go out 08:00–20:00 SAST (UTC+2, no DST);
  anything outside that defers to 08:00. **New-lead alerts go out at any hour.**
- **TextMeBot allows 1 message per 5 seconds** across the whole account. Sends
  are spaced 5.5s apart and capped at 8 per invocation. A rate-limited send
  (403) is retried after 30s on the same step. Other failures post
  "could NOT send" to Discord. Only real sends write `whatsapp_sent`.
- `agent_profiles.automations_paused` holds one account's runs; `panic-automations`
  stops everything.
- `template_override` holds one-off wording for a single queued run.

**Number format decides delivery.** Sends strip non-digits: `+27 82 …` becomes
`2782…`, which works, but `082 …` becomes `082…`, which is silently rejected.
**Store `whatsapp_number` as 27… (international).**

---

## 11. Integrations

### Facebook / Meta
- **Tokens (Vault):** `FB_ACCESS_TOKEN`, `FB_ACCESS_TOKEN_2`, and
  `FB_ACCESS_TOKEN_ALDREDT` (used by some functions). Functions try them in order.
- **Page vs user tokens:** `leadgen_forms` and form leads need a **page** token
  (from `me/accounts`, cached in `fb_page_tokens`). A user token gives a
  misleading permission error.
- **Rate limits are app-wide:** codes **4, 17, 32, 613** mean stop. Functions set
  `fb_api_state.backoff_until` (20 min), and every Facebook call pauses. Never
  throw on a rate limit in a way React Query will retry: return a flag.
  (Throwing once caused a self-inflicted outage through focus-refetch storms.)
- `me/accounts` is the most expensive call. Cache everything; forms are served
  from `fb_form_cache`.
- **Insights double-counting:** the same leads appear as both `lead` and
  `onsite_conversion.lead_grouped`. Pick **one** action type in priority order
  (`LEAD_ACTION_PRIORITY` in `fb-active-ads`). Never sum them.
- **Instant-form leads arrive via the poll** (`sync-fb-leads`, every 15 min), not
  reliably via the webhook.
- **Multi-page agents:** a lead source's `fb_page_id` says which page its form
  lives on (e.g. Bennie's Dubai form lives on "Apex Elite", not his main page).
- **Pixel and CAPI:** the pixel fires `Lead` in the browser with an `event_id`;
  `fb-capi-lead` sends the same `event_id` server-side so Meta dedupes. Weak
  leads are sent by neither. Setup: `CAPI-SETUP.md`.
- **Attribution:** landing pages capture `utm_*`, `fbclid` and Meta URL macros
  such as `{{ad.id}}` on first hit (`lib/adAttribution.ts`), stored in
  `leads.attribution`.
- **Meta Ads MCP:** field names differ from Graph (`amount_spent`, not `spend`).
  Verify them with `ads_get_field_context`. Some ad accounts aren't MCP-enabled
  (Bennie, Zainub).
- **Housing Special Ad Category:** no age, gender, postcode or interest
  targeting. **The ad copy and landing page are the targeting**: name the suburb,
  price band, property type and seller situation.

### WhatsApp (TextMeBot)
One API key (`TEXTMEBOT_API_KEY`) for everything, limited to 1 message per 5
seconds. If WhatsApp bans that number, every alert stops, so never expose an
unauthenticated sender.

### Discord
`track-activity` posts agent-branded embeds (new leads, stage changes, calls,
page events, ad pause/resume, disqualifications with the reason) to
`DISCORD_ACTIVITY_WEBHOOK`. The embeds include PostHog replay links and a `/l/`
"Open lead" link.

### PostHog
All text and inputs are masked. `person_profiles: identified_only`. Needs the
Vault secrets `POSTHOG_PROJECT_ID` and `POSTHOG_HOST` for replay links.

Sign-up funnel events: `powered_by_clicked` (placement, ref) →
`signup_viewed` → `signup_started` → `signup_step_completed` (step, index) →
`signup_submitted` (wants, budget) → `signup_whatsapp_clicked`, plus
`signup_save_failed`. `signup_from` / `signup_ref` are registered as super
properties, so every event and replay carries the source page.

---

## 12. Lead lifecycle, end to end

1. **Website:** an ad click lands on `/p/<slug>` with UTMs. Pixel `PageView`,
   funnel `view`, attribution stored. The visitor steps through the questions.
   A disqualifying answer shows "not a fit" (and logs `disqualified`). Submit
   fires pixel `Lead` (good leads only), navigates to `/thank-you`, and runs
   `public-submit-lead` in the background. That inserts the lead (`quality`,
   `attribution`, `source_page_id`), mints a token, and posts to Discord.
   `fb-capi-lead` runs if CAPI is configured.
   **Facebook instant form:** `sync-fb-leads` (every 15 min) inserts new
   `fb_lead_id`s into the linked source's pipeline.
2. **The insert fires `enqueue_automations`,** which queues "New lead — instant
   agent ping" (if the lead is fresh). Within a minute, `run-automations` sends
   the agent a WhatsApp with an `/l/<token>` link.
3. **The agent taps the link,** calls, and taps "What happened?". The outcome goes
   through `log-outcome`: the stage patch is applied, `lead_events` is written,
   and stage automations are queued.
4. **The follow-ups** (retry nudge, follow-up sequence, appointment reminders)
   carry on until a dead or winning stage.
5. **The Overview** rolls up leads, reached, appointments, mandates and
   commission (expected vs earned) against ad spend.

---

## 13. Security model (as of 25 Sept 2026)

**What the public anon key (shipped in the JS bundle) can read:** `lead_pages`,
`pipelines`, `custom_questions`, `sold_listings`, and the RPCs
`get_shared_lead(token)` (one lead for an exact, unexpired token) and
`lead_page_funnel` (returns zeros, because of RLS). It **can't** read `leads`,
`agent_profiles` or `lead_share_tokens`. This was verified by probing as anon.

**RLS pattern:** an agent sees rows where `agent_id = auth.uid()`; the operator
sees everything via `is_operator()`. Edge functions use the service role and
bypass RLS, **so every function must check its own caller.**

**Fixed on 25 Sept (don't regress these):**
- **WhatsApp-code login disabled.** It had a hardcoded backdoor
  (`+10000000000` / `0000`) that created operator accounts, plus brute-forceable
  4-digit codes that matched existing accounts. Login is **phone + password
  only**. Don't rebuild OTP login without rate limits, expiry and a single email
  domain.
- **The share-link leak.** Policies exposed every lead that had any live token,
  no token needed. It's now the `get_shared_lead` RPC plus 32-char tokens; the
  four open policies were dropped.
- **The ad functions** (`fb-set-ad-status`, `fb-active-ads`, `fb-ad-insights`,
  `fb-ad-account`) had no auth. They now require an operator or the owner of
  the ad account.
- `get_secret` is service-role only (revoked from anon and authenticated in Sept).

**Still open (ranked in `AUDIT-2026-09-25.md`):**
1. `run-automations` and `sync-fb-leads` can be triggered by anyone. The fix is a
   `CRON_SECRET` header, with the cron commands updated in the same change.
2. `get-fb-form` (with `force`), `list-fb-forms` and `discover-fb-pages` have no
   auth, which risks quota burn and leaks client page names.
3. The Facebook page picker shows every client's page names to any agent. It
   should be operator-only.
4. A hardcoded Discord webhook in `run-automations` (a private repo, but it's in
   git history).
5. Leaked-password protection is off in Supabase Auth.

**Secrets** (names only):
- Vault: `FB_ACCESS_TOKEN`, `FB_ACCESS_TOKEN_2`, `FB_ACCESS_TOKEN_ALDREDT`,
  `DISCORD_ACTIVITY_WEBHOOK`, `POSTHOG_PROJECT_ID`, `POSTHOG_HOST`,
  `GOOGLE_SERVICE_ACCOUNT_KEY`
- Function env: `TEXTMEBOT_API_KEY`, `TEXTMEBOT_ENDPOINT`,
  `LEAD_WEBHOOK_SECRET`, `FB_VERIFY_TOKEN`, `DISCORD_SUPPORT_WEBHOOK`,
  `DISCORD_LEAD_ACTIVITY_WEBHOOK` (the last two must be set before redeploying
  `send-ticket-email` or `new-lead-webhook` from the repo)
- Frontend (Vercel): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
  `VITE_PUBLIC_POSTHOG_KEY`, `VITE_PUBLIC_POSTHOG_HOST` (tick "Preview" too);
  `VITE_VERCEL_ENV` is automatic

---

## 14. Service-delivery playbooks

### Onboard a new agent
1. Call `create-agent` (operator JWT). It creates `<digits>@estatekit.app` +
   password, the profile, and Seller and Buyer pipelines.
2. Profile: `display_name`, `whatsapp_number` (**27… format**), `area`,
   `company`, `fb_page_id`, `fb_ad_account_id` (digits, no `act_`).
3. Optional white-label: `sidebar_color`, `sidebar_logo_url`.
4. The agent logs in, goes through `/welcome`, and sets their own password.
5. Build their lead source (below). Check that "New lead — instant agent ping"
   reaches their WhatsApp with a test lead using your own number.

### Build a website lead form that converts
What we learned (Siva, Sept 2026): a 39-word consent question with a hard
reject cut contact-step reach from about 16/day to about 0. Rules:
- **4–6 questions, each readable by a fourth-grader.** One idea per question.
- **One hard rejection at most:** "not the owner" (a non-owner can't sign a
  mandate). Everything else that's "bad" should be a **weak lead**
  (`low_quality_answers`), not a rejection.
- **Keep "what's making you think about selling?"** Reason-for-selling is the
  strongest predictor of a 0–3 month timeline (financial pressure and
  maintenance are the hot ones).
- Put **"A real price means seeing the house. Is it OK if <agent> visits?"**
  last, with "No, just send me a number online" as a **weak** answer. Siva and
  James both use it.
- Keep the thank-you copy consistent with the form. If the price comes after a
  visit, don't promise "your report is on the way".
- Name the **suburb** in the headline (it's your targeting under the Housing
  category).
- Set `fb_pixel_id` if ads point at the page. Watch the **Page performance**
  strip: views → started → contact → opt-ins → disqualified.

### Connect a Facebook instant form
Forms → Add lead source → Facebook form → pick the form → pick the pipeline.
If the form is on a different Facebook page from the agent's own, use **"Use a
different page"**. Leads arrive within 15 minutes (the poll).

### Diagnose "leads dropped"
1. **Meta first:** daily spend and impressions (Meta MCP `ads_get_ad_entities`,
   `time_increment: "1"`). Zero impressions means the ads stopped (billing,
   paused, rejected, or the account is UNSETTLED). That's not our bug.
2. **Then the funnel:** `lead_page_events` per day (views / start / contact /
   submit / disqualified). If traffic is steady but contact collapses, the form
   is the cause. Find which question was added when (`custom_questions.created_at`).
3. **Facebook-form sources:** check that the sync cron ran and that
   `fb_api_state.backoff_until` isn't active.

### A lead didn't arrive
Website: `public-submit-lead` logs, and whether they were disqualified (Discord
"Lead disqualified" card). Facebook: the cron ran, no backoff, the form is linked
to a lead source.

### An agent didn't get their WhatsApp
Is `automations_paused` set? Was the lead older than 30 minutes at insert (an
import)? Is it a follow-up outside 08:00–20:00 SAST? Is the number in 27…
format? What's `automation_runs.status`? Is there a "could NOT send" note in
Discord?

### Ad numbers look wrong
Compare with the Meta MCP. Roughly double the leads at half the CPL means
overlapping action types are being summed (§11).

### Reactivate a client imported from the old dashboard
On 25 Sept 2026, the 21 old-dashboard clients who had no account here were
imported as **accounts only (no lead history)** and **switched off**: a random
password nobody knows, `automations_paused = true`, `onboarded = false`. They
can be found with
`auth.users.raw_user_meta_data->>'imported_from' = 'old dashboard'`, which also
stores `old_user_id`. To bring one back:
1. Account → agent passwords → set a password (`admin-set-password`).
2. Un-pause their automations; check `whatsapp_number` is 27… format.
3. Connect their lead source (Forms → Add lead source).
Their logo and photo URLs still point at the **old** project's storage
(`vatyiwyuuhvhdnhmbyyy…/storage`), so re-upload them before pausing or deleting
the old project. Harvey Van Wyk was registered with Kieran's own number, so he
has a placeholder login (`harvel-realty.import@estatekit.app`) and no WhatsApp
number. Alex Prinsloo's old account is the same team as Storm Hargreaves' account
here ("Team Alex & Storm").

### Demo page for a prospect
Brand an existing page on Kieran's account: accent from their logo, their phone,
a suburb headline, their listings as `sold_listings` `status='listed'` (not
"sold" unless they really sold). **Upload the logo through the app** (Forms →
Logo). Writing base64 by hand is unreliable. Remember `sold_listings` is per
account.

---

## 15. Known gaps and backlog

From `AUDIT-2026-09-25.md`, most valuable first:
1. The security items in §13 ("Still open").
2. **Public lead page failure modes:** a failed fetch shows "This page isn't
   available"; failed question loading shows a form with no questions; a failed
   submit still shows the thank-you screen and loses the lead silently. The fix
   is to await the submit and offer a retry.
3. **Page weight:** logos and photos are base64 in `lead_pages` (Siva's page is
   about 3.6 MB of images plus a 1.4 MB JS bundle). Move them to Storage, select
   only the needed columns, and code-split the bundle.
4. **Share previews:** every `/p/` link shows the generic EstateKit preview
   (`og:image` is a relative SVG). Add a Vercel function to inject per-page meta.
5. `sold_listings` is per agent, not per page. Plan: add a nullable `page_id`.
6. `addLeadPage` doesn't check that the pipeline belongs to the agent.
7. The sync re-inserts the last 3 days every run (about 5,600 wasted 409s a day),
   and its per-form results are lost to the pg_net timeout.
8. Dead code: `overview_daily` / `refresh_overview_daily`, the `temp-*` stubs,
   `daily-reminders`, `sync-pipeline-sheet`, and three empty
   `@phone.estatekit.co` accounts.

---

## 16. Related documents

| File | What |
|---|---|
| `SHIPPING.md` | Day-to-day safe shipping with one database, in plain English |
| `AUDIT-2026-09-25.md` | Overnight audit: findings, fixes, ship order, backlog |
| `CAPI-SETUP.md` | Conversions API walkthrough |
| `SPEC-multi-page-agents.md` | Agents whose forms live on more than one Facebook page |
| `supabase/schema/…_production_snapshot.sql` | Full database DDL (reference only) |
| `supabase/migrations/` | What's been applied since 19 Sept, add-only |

**History:** 3 Sept, first agents. 12–16 Sept, Supabase backend, funnel tracking,
Discord activity. 19–20 Sept, CAPI, lead-quality grading, EOD nudge, action-page
confirmations. 23 Sept, Facebook quota fixes, general pipeline, appointment
times. 24 Sept, multi-page Facebook sources. 25 Sept, security audit and fixes,
the shipping workflow, and this document.

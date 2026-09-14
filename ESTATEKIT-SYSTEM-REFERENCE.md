# EstateKit — System Reference

Reference for running and extending EstateKit: the lead-management dashboard used by
South African real estate agents. Written to be dropped into a Claude Project as
knowledge, so service-delivery work (setting up a new agent, building forms, wiring
Meta ads, debugging a lead that didn't arrive) can be done without re-reading the code.

**Who uses the product:** working estate agents, mostly non-technical, mostly on a
phone. Every UI decision assumes the agent does not want to think about how the tool
works. Keep that constraint when changing anything user-facing.

---

## 1. Stack and hosting

| Piece | What it is |
|---|---|
| Frontend | React 19 + TypeScript + Vite, MUI (Material Design 2 — deliberately plain "Android" look, light mode only) |
| State/data | TanStack React Query; Supabase JS client |
| Backend | Supabase — Postgres + RLS, Edge Functions (Deno), Vault, pg_cron, Storage |
| Hosting | Vercel, auto-deploys from `main`. SPA rewrite in `vercel.json` |
| Analytics | PostHog (session replay; all text/inputs masked — lead PII must never reach it) |
| Ops alerts | Discord webhooks via the `track-activity` edge function |
| WhatsApp | TextMeBot HTTP API (`TEXTMEBOT_API_KEY` env var on the edge function) |

Supabase project ref: `yfcnsvrhojpysrzqrkdi`
App URL: `https://leads.estatekit.co`

### Commands
```bash
npm run dev      # local dev server
npm run build    # tsc -b && vite build  — must pass before pushing
npm run lint     # oxlint
```
There is no local Supabase CLI in this environment. Migrations and edge-function
deploys are applied through the Supabase MCP tools directly against the live project.

---

## 2. Core domain model

A **lead** belongs to an **agent** and sits in a **pipeline**. Pipelines come in two
kinds, which differ only in their stage list and the wording of the outcome options.

```
seller:  New Lead → Contacted → Booked → Mandate Signed        (+ No Answer, Lost, Invalid Number)
buyer:   New Lead → Contacted → Viewing Booked → Offer Made → Bought   (+ same dead stages)
```

Stage is the single source of truth for progress — there is no separate event log
driving the funnel. Moving a lead's stage applies an **SOP patch** (`computeStagePatch`
in `src/lib/stageLogic.ts`) that sets `next_label`, `due`, `reminder_at` and sometimes
`commission`. That file is the encoded sales process; change it there, not per-screen.

Key derived concepts:
- `due` — this lead needs action today. Drives the call list and row highlighting.
- **dead stages** — Lost, Invalid Number. Excluded from call lists, no Call button.
- **parked stages** — sorted below active work.

---

## 3. Database

18 tables, all with RLS enabled. `is_operator()` is the privilege check used throughout:
operators (you/staff) can read and write across all agents; an agent sees only their own
rows.

### Tables that matter most

**`leads`** (~914 rows) — the product.
`id, agent_id, name, phone, email, stage, next_label, reminder_at, due, form_answers jsonb,
note, commission, created_at, updated_at, pipeline_id, source_page_id, fb_lead_id, fb_ad_id, archived`
- `form_answers` is `[{q, a}]` — question label and answer captured at submit time, so
  later edits to the form don't rewrite history.
- `fb_lead_id` set for Meta instant-form leads; `fb_ad_id` links back to the ad.
- `archived` hides a lead from the working list without deleting it (operator-only view).

**`agent_profiles`** (14 rows) — one per agent, `agent_id` = auth user id.
`display_name, whatsapp_number, email, area, company, is_operator, tier, onboarded,
automations_paused, fb_ad_account_id, fb_page_id, sidebar_color, sidebar_logo_url,
billing_type, adspend_balance, renewal_date, contract_pdf_url`
- `whatsapp_number` **must be stored in international form (`27…`)** — see §7.
- `sidebar_color` / `sidebar_logo_url` drive per-agent white-labelling of the dashboard.
- `fb_page_id` also gives a free avatar via `graph.facebook.com/<id>/picture`.

**`pipelines`** — `agent_id, name, kind ('seller'|'buyer'), sheet_url`.
`sheet_url` is set once a Google Sheet export has been created for that pipeline.

**`lead_pages`** (16) — a landing page / form. `slug` is the public URL segment
(`/p/<slug>`). Fields cover copy (`headline, agent_name, suburb, name_label, phone_label,
cta_label, thank_you_headline, thank_you_subtext`), branding (`accent_color,
logo_data_url, profile_photo_data_url`), behaviour (`show_intro, collect_email`),
tracking (`fb_pixel_id`) and routing (`pipeline_id`).
- `source_type` is `'website'` or a Meta instant form; `fb_form_id` / `fb_form_name`
  link a page to a Meta lead form.

**`custom_questions`** (30) — the form body, one row per question.
`page_id, agent_id, label, type, options jsonb, helper_text, required, is_default,
sort_order, disqualify_answers text[]`
- `type` ∈ `short_text | address | multiple_choice | yes_no`.
- `disqualify_answers` — picking one of these ends the flow politely and **creates no
  lead**. This is the qualification filter; use it rather than letting junk through.

**`automations` / `automation_steps` / `automation_runs`** — see §6.

**`lead_events`** (1466) — per-lead history. `event_type, from_value, to_value, source,
actor_id, device`. Powers the lead-history timeline (who changed what, on which device).
Attribution comes from `x-ek-source` / `x-ek-actor` / `x-ek-device` request headers, which
are only trusted when the caller is `service_role`.

**`lead_page_events`** (302) — funnel analytics per page: `view, start, contact, submit,
disqualified`, deduped by `session_id`. Feeds the admin-only funnel strip on `/lead-page`.

**`lead_share_tokens`** (533) — short opaque tokens giving passwordless access to one
lead at `/l/<token>`. This is what WhatsApp and Discord links use. Never send
`/leads/<uuid>` externally — that route requires being signed in as that exact agent.

**`sold_listings`** — social proof shown on lead pages. `status` is `'sold'` or `'listed'`.

**`setup_steps`** — per-agent onboarding checklist, seeded by `seed_setup_steps()`.

### Database functions
| Function | Purpose | Who may execute |
|---|---|---|
| `is_operator()` | privilege check used by nearly every RLS policy | authenticated, anon |
| `get_secret(name)` | reads Vault | **service_role only** — see §9 |
| `enqueue_automations()` | trigger on `leads`, queues automation runs | service_role |
| `record_lead_event()` | trigger on `leads`, writes history | service_role |
| `dedupe_lead_call()` | trigger on `lead_events`, collapses repeat call rows | service_role |
| `lead_page_funnel(page_id, since)` | funnel counts for a page | any |
| `find_user_id_by_phone(phone)` | login lookup | service_role |
| `seed_setup_steps()` | onboarding checklist | service_role |

### Scheduled jobs (pg_cron)
| Job | Schedule | Calls |
|---|---|---|
| `run-automations-every-minute` | `* * * * *` | `run-automations` |
| `sync-fb-leads-every-5-min` | `*/5 * * * *` | `sync-fb-leads` |

Meta instant-form leads arrive via **the 5-minute poll, not the webhook**. If a lead is
"missing", check that cron ran before suspecting the webhook.

### Storage
One public bucket, `logos` — agent logos and profile photos.

---

## 4. Edge functions

All live in `supabase/functions/<name>/index.ts`. They run as `service_role`, so they
bypass RLS and are the only things allowed to read Vault.

**Lead intake**
- `public-submit-lead` — website form submit. Looks up the page, inserts the lead, mints
  a share token, pings activity. No auth (`verify_jwt: false`).
- `fb-lead-webhook` — Meta webhook receiver.
- `sync-fb-leads` — the 5-minute poll that actually brings instant-form leads in.
- `fb-lead-source-ad` — resolves which ad a lead came from.

**Facebook / Meta**
- `list-fb-forms` — lead forms for a page. Needs a **page access token** obtained via
  `me/accounts`; a user token will not work.
- `get-fb-form` — one form's questions.
- `discover-fb-pages` — pages reachable from the stored tokens.
- `fb-ad-account` — balance, currency, funding source (card vs prepaid).
- `fb-ad-insights` — daily spend series for the Overview table.
- `fb-active-ads` — ad cards with creative + per-ad spend/leads/CPL.
- `fb-set-ad-status` — pause/resume an ad.

**Agent actions**
- `lead-call`, `lead-note`, `log-outcome` — write lead activity with proper attribution.
- `create-agent`, `admin-set-password` — onboarding.
- `sync-pipeline-sheet` — create/refresh the Google Sheet export.

**Messaging / ops**
- `run-automations` — the automation engine (§6).
- `panic-automations` — kill switch.
- `track-activity` — Discord activity embeds.
- `track-page-event` — funnel events.
- `daily-reminders`, `new-lead-webhook`, `send-ticket-email`.
- `request-whatsapp-otp`, `verify-whatsapp-otp`.

**Cleanup note:** four `temp-*` functions (`temp-onboard-one`, `temp-fb-lookup`,
`temp-send-whatsapp`, `temp-fb-token-check`) are still deployed from one-off migration
work. They are not in the repo and should be deleted once confirmed unused.

---

## 5. Facebook / Meta integration

Three long-lived tokens live in Vault: `FB_ACCESS_TOKEN`, `FB_ACCESS_TOKEN_2`,
`FB_ACCESS_TOKEN_ALDREDT`. Functions try them in order and fall through on failure.

**Things that have actually bitten us:**

1. **Page tokens vs user tokens.** `leadgen_forms` requires a *page* access token fetched
   through `me/accounts`. A user token returns a confusing permission error.
2. **App-level rate limiting.** Error `(#4) Application request limit reached` is
   app-wide, not per-page — it makes every agent's form fetch fail at once and looks like
   a permissions bug. Codes to bail out on immediately: **4, 17, 32, 613**.
3. **Duplicate lead action types.** Insights returns the same conversions under several
   `action_type` values at once (`lead` *and* `onsite_conversion.lead_grouped`, identical
   values). **Never sum every "lead"-ish action** — pick one canonical type in priority
   order, or leads double and cost-per-lead halves.
4. **Per-ad insights** are fetched by field expansion
   (`insights.time_range(...){spend,clicks,impressions,actions}`) rather than one call per
   ad, to stay under rate limits.

**Useful via the Meta MCP:** `ads_get_ad_entities` (entities + metrics, supports
`date_preset` / `time_range`, filtering, sorting), `ads_get_field_context` (verify a field
name before using it), `ads_insights_performance_trend`, `ads_get_opportunity_score`.
Field names differ from Graph — `amount_spent` not `spend`, `lead` and
`onsite_conversion_lead_grouped` as separate columns. Always verify with
`ads_get_field_context` first.

---

## 6. Automations

`automations` (trigger) → `automation_steps` (ordered actions) → `automation_runs` (queue).

Triggers: `lead_created`, `stage_changed` (with `trigger_stage`), `reminder_due`.
Step actions: `send_whatsapp`, `set_reminder`, `set_stage`.

Currently configured:

| Automation | Trigger | State |
|---|---|---|
| New lead — instant agent ping | `lead_created` | enabled |
| Contacted — follow-up sequence | → Contacted | enabled |
| Booked — appt reminder + did-they-sign nudge | → Booked | enabled |
| No Answer — retry nudge | → No Answer | enabled |
| Mandate Signed — confirmation | → Mandate Signed | enabled |
| Offer Made — follow-up | → Offer Made | disabled |
| Viewing Booked — prep reminder | → Viewing Booked | disabled |

**Messages go to the agent, about their lead — never to the lead.**

Template variables: `{{name}}`, `{{first_name}}`, `{{phone}}`, `{{stage}}`,
`{{next_label}}`, `{{action_link}}`. `{{action_link}}` mints a fresh
`lead_share_tokens` row and expands to `https://leads.estatekit.co/l/<token>` (7-day
expiry from automations, 30-day from Discord).

**Behaviours worth knowing:**
- **Quiet hours** — sends only 08:00–20:00 SAST; anything queued overnight defers to
  morning.
- **Freshness gate** — runs for leads older than ~30 minutes are skipped. This exists to
  stop a backfill blasting old leads, but it also means **any backdated import silently
  sends nothing**. If you import history and expect notifications, this is why they
  didn't arrive.
- `agent_profiles.automations_paused` pauses one account; `panic-automations` stops
  everything.
- `automation_runs.template_override` holds one-off edited wording for a single queued run
  (that's what double-click-to-edit in the Automations tab writes).

---

## 7. WhatsApp delivery

`sendWhatsApp()` in `run-automations` strips non-digits and passes the result to
TextMeBot as `recipient`. That means **the stored format decides whether delivery
works**:

- `+27 82 000 0000` → `27820000000` ✅
- `082 000 0000` → `0820000000` ❌ silently rejected (logged to console only)

All 14 current agents are stored in `27…` form. When onboarding a new agent, store the
international format. Worth hardening at some point by normalising in `sendWhatsApp`
rather than relying on data entry.

---

## 8. Frontend map

```
src/
  api/         one module per table/domain; _client.ts owns the Supabase client
               and the "operator is managing agent X" mechanism
  hooks/       React Query wrappers (useLeads, useOverview, useAutomations, useAuth…)
  lib/         stageLogic (the SOP), activity (Discord), pageTracking, contrast, tour
  components/  LeadCaptureForm, ActiveAds, OutcomeSheet, FocusCallModal, LeadHistory…
  pages/       LeadsPage, LeadPagePage (form builder), OverviewPage, AccountPage…
```

**Routes**

| Route | Access |
|---|---|
| `/l/:token` | public — single lead via share token |
| `/p/:slug` | public — live lead page |
| `/thank-you`, `/privacy` | public |
| `/leads`, `/leads/:id`, `/lead-page`, `/account`, `/upgrade` | signed in |
| `/overview` | operator only (route guard) |
| `/admin/automations` | operator only (in-page guard) |

**Account switching.** An operator can act as any agent. `setActiveAgent(id)` sets an
in-memory value plus a localStorage key **scoped to the real signed-in user's id** —
never a single shared key, because an unscoped flag once leaked one operator's managed
account into a different person's session. Both halves are cleared on sign-in, sign-out,
and any session change, along with the React Query cache.

---

## 9. Security notes

- **`get_secret()` is service_role only.** It is `SECURITY DEFINER` over Vault and lives
  in the `public` schema, so PostgREST exposes it at `/rest/v1/rpc/get_secret`. It
  previously granted EXECUTE to `anon`/`PUBLIC`, which meant anyone with the anon key
  (it ships in the browser bundle) could read the Facebook tokens and Discord webhook by
  name. Revoked. **Never re-grant it to `anon` or `authenticated`.**
- `leads` has a `Public can insert leads` policy with `WITH CHECK (true)` so the public
  form works. Prefer routing submissions through `public-submit-lead` rather than
  widening this further.
- PostHog masks all text and inputs — lead PII must never reach it.
- Leaked-password protection is currently **off** in Supabase Auth.
- `otp_codes` and `phone_otp_codes` have RLS on with no policies (effectively locked).

---

## 10. Service-delivery playbooks

### Onboard a new agent
1. `create-agent` edge function → auth user + `agent_profiles` row.
2. Fill `display_name`, `whatsapp_number` (**`27…` format**), `area`, `company`.
3. Set `fb_page_id` and `fb_ad_account_id` — these unlock ad cards, spend, and the avatar.
4. Optionally set `sidebar_color` / `sidebar_logo_url` for white-labelling.
5. Create a pipeline (seller or buyer) — leads have nowhere to land without one.
6. Build a lead page (below). `onboarded` + `/welcome` handle the agent's first run.

### Build a lead page / form
1. Create the `lead_pages` row, pointed at a `pipeline_id`, with a unique `slug`.
2. Add `custom_questions` in `sort_order`. Keep it short — every extra step costs
   conversion. Address and timeline questions are the usual defaults.
3. Use `disqualify_answers` to filter rather than collecting junk leads (e.g. "Just
   curious" on a timeline question).
4. Set `fb_pixel_id` if ads point at it.
5. Preview at `/lead-page`; live at `/p/<slug>`. The admin-only funnel strip shows
   view → start → contact → submit so you can see where people drop.

### A lead didn't arrive
1. Website form → check `public-submit-lead` logs.
2. Meta instant form → check the `sync-fb-leads` cron ran (5-min), not the webhook.
3. Check `custom_questions.disqualify_answers` — they may have been filtered on purpose.
4. Check the Facebook token isn't rate-limited (error code 4).

### An agent didn't get their WhatsApp
1. Is `automations_paused` set on their profile?
2. Is the lead older than ~30 min (freshness gate)?
3. Is it outside 08:00–20:00 SAST (deferred)?
4. Is `whatsapp_number` in `27…` format?
5. Check `automation_runs.status` for that lead.

### Ad numbers look wrong
Compare against `ads_get_ad_entities` with `date_preset: "maximum"` and fields
`["name","spend","lead","onsite_conversion_lead_grouped","cost_per_lead"]`. If the
dashboard shows roughly double the leads and half the CPL, something is summing
overlapping action types again (§5.3).

---

## 11. Known gaps

- **No `supabase/migrations/` directory.** The schema lives only in the cloud; changes
  have been applied directly. There is no reproducible way to stand up a fresh
  environment. This is the biggest structural gap.
- Four `temp-*` edge functions still deployed.
- Bundle is ~1.36 MB (409 KB gzipped) with no code splitting — slow on SA mobile data.
  Route-level `React.lazy` on the heavy pages would be the obvious win.
- `useRealtimeSubscriptions` subscribes to all `leads` changes with no agent filter, so
  an operator refetches on every agent's activity.
- Automation freshness gate will silently swallow any future backdated import.

# Spec — an agent with more than one Facebook page

Status: **proposed, nothing built**. Written after connecting Bennie's Dubai
recruitment form by hand, because the dashboard could not do it.

---

## The problem

`agent_profiles.fb_page_id` is a single column. One agent, one Facebook page.

Bennie now has two:

| Page | ID | Used for |
|---|---|---|
| APEX Real Estate | `102676318479700` | all his SA property forms |
| Apex Elite Real Estate Brokerage | `1327453450451767` | the Dubai recruitment ad |

His profile can only name one, so everything keyed on it is wrong for the other.
This is not Dubai-specific — it happens the moment any client opens a second
brand, a second market, or a separate recruitment page.

---

## What actually breaks

Three things, all verified against the live system rather than reasoned about.

### 1. You cannot connect the second page's form at all — hard blocker

`AddPageDialog` lists forms by calling `listFbForms(profile.fbPageId)`
(`LeadPagePage.tsx:785`). It only ever asks about the one page on the profile,
so the Dubai form never appears in the list and there is no way to select it.

**This is why the Dubai form had to be inserted directly into the database.**
Every future second-page client hits the same wall, and the workaround needs
database access — not something service delivery can do.

### 2. The form preview shows the wrong Facebook page

`FbFormPreview` is passed `profile.fbPageId` (`LeadPagePage.tsx:545`), so the
preview header renders the page name and avatar of whichever page is on the
profile. Confirmed live: previewing the Dubai form returns
`page: "APEX Real Estate"` — the wrong brand, on a screen used to show clients
what their form looks like.

### 3. Wasted Facebook quota on every uncached fetch

`get-fb-form` and `sync-fb-leads` resolve a page token for the page id they are
given. With the wrong page id that lookup can never match, so it fails through
every token before falling back to raw user tokens. The form still loads — which
is why this was invisible — but each attempt spends quota we have just finished
protecting.

### Not affected

`fb-lead-webhook` resolves **form → lead_page → agent** first
(`fb-lead-webhook/index.ts:88-99`) and only falls back to `fb_page_id`. Because
the Dubai form is now a connected lead source, real-time delivery works. Worth
stating explicitly: this is *not* an argument for the change.

---

## Proposed change

**Add `fb_page_id` to `lead_pages`.**

A lead source already knows its own form. Let it know its own page too. The
profile keeps its `fb_page_id` as the default for everything else (avatar,
"create a form in Ads Manager" link, new sources).

```sql
alter table public.lead_pages
  add column if not exists fb_page_id text;

-- Existing rows inherit the agent's page, so nothing changes for anyone today.
update public.lead_pages lp
set fb_page_id = ap.fb_page_id
from public.agent_profiles ap
where lp.agent_id = ap.agent_id
  and lp.fb_page_id is null
  and coalesce(ap.fb_page_id, '') <> '';
```

Resolution rule everywhere: **`lead_page.fb_page_id ?? profile.fb_page_id`**.
Null means "same as the agent's page", which is true for every existing row.

### Touchpoints

| Where | Change |
|---|---|
| `LeadPagePage.tsx:545` | preview uses `page.fbPageId ?? profile.fbPageId` |
| `LeadPagePage.tsx:785` | Add-source dialog: page picker, defaults to the profile's |
| `api/leadPages.ts` | `addLeadPage` accepts and stores `fbPageId` |
| `sync-fb-leads:201` | page token from the lead page, profile as fallback |
| `types/index.ts` | `LeadPage.fbPageId: string \| null` |

Five small edits. No new tables, no new concepts in the UI beyond one dropdown
that most clients never touch.

### The page picker

The dialog already calls `discover-fb-pages`-style data — 43 pages are reachable
from our tokens. Listing all 43 would be its own usability problem, so:

- default to the agent's own page, selected, no interaction needed
- a single "Use a different page" link that reveals the picker
- the picker lists pages, searchable, same shape as the account switcher

An agent with one page never sees it. That keeps the common case at zero extra
decisions, which is the standard everything else on this screen is held to.

---

## What I would not do

**A `agent_fb_pages` join table.** Correct in the abstract, and overkill: it
adds a management screen, a concept ("your pages"), and a many-to-many nobody
asked for. The page belongs to the lead source, not to the agent — a form lives
on exactly one page, so one column on `lead_pages` models it accurately.

**Changing `agent_profiles.fb_page_id`.** It still has a real job: the account
switcher's avatar, the Ads Manager deep link, and the default for new sources.
Leave it as the agent's primary page.

---

## Risk

Low. The column is nullable, existing rows are backfilled to today's behaviour,
and every read falls back to the profile. A row with a wrong page id degrades to
exactly what happens now — a failed token lookup and a fallback — rather than
breaking.

The one thing to get right is the backfill running *before* the code reads the
column, or new sources briefly lose their page. Same ordering as any additive
migration.

---

## Effort

Roughly an hour: migration + backfill, five edits, redeploy `sync-fb-leads`.

## Open questions for you

1. **Page picker, or type the page ID?** A picker is friendlier but lists 43
   pages. Typing an ID is uglier and needs no discovery call. I lean picker
   behind a "use a different page" link.
2. **Should the profile keep a primary page at all**, or should sources always
   name their own? Keeping it means one less decision for single-page clients,
   which is most of them. I lean keep.
3. **Is Bennie's Dubai brand permanent?** If Apex Elite becomes a second
   full client account rather than a second page on his, the right answer is a
   separate agent account and none of this is needed.

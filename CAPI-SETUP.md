        # Conversions API — setup, in order

Written for whoever does service delivery. Assumes no prior CAPI knowledge.
About 10 minutes per client, once.

---

## What it does, in one paragraph

Your lead page already fires a Meta pixel in the visitor's browser. Ad blockers,
iPhone tracking prevention and cookie restrictions eat a meaningful share of
those — Meta never hears about the lead, so it can't learn from it or count it.
The Conversions API sends the same conversion **from our server**, which nothing
can block. Both are sent with the same ID so Meta collapses them into one
conversion instead of counting the lead twice.

**Only for lead pages** (`/p/...`). Instant-form leads are created inside
Facebook and never touch our site, so there's nothing to send.

---

## Before you start

You need:

- the client's **Pixel ID** already saved on the lead page
- **admin access** to their Business Manager

---

## Step 1 — Get the access token from Meta

1. Go to **business.facebook.com** → **Events Manager**
2. Pick the client's pixel in the left sidebar
3. **Settings** tab
4. Scroll to **Conversions API**
5. Click **Generate access token**
6. Copy it

It's a long string starting `EAA...`. Treat it like a password — it can send
events as that business.

> Can't see "Generate access token"? You're not an admin on that Business
> Manager. Get upgraded; there's no way around it.

---

## Step 2 — Get a test event code

Still in Events Manager:

1. **Test events** tab
2. Copy the code shown (looks like `TEST12345`)

This lets you prove the wiring works without touching the client's ad delivery.
**Always start with this.**

---

## Step 3 — Paste both into EstateKit

1. Open the client's account → **Forms** → pick the lead page
2. **Tracking** section
3. Turn on **Advanced tracking**
4. Paste the access token
5. Paste the test event code
6. Click **Turn on**

The chip should read **On** with a **Test mode** chip beside it.

---

## Step 4 — Prove it works

1. Open the live page (`leads.estatekit.co/p/<slug>`) in a private window
2. Fill the form in properly and submit
3. Back in Events Manager → **Test events**

Within about 30 seconds you should see **two** rows for one submission:

| Source | Meaning |
|---|---|
| Browser | the pixel |
| Server | the Conversions API |

**Both showing = correct.** They share an event ID, so Meta counts one
conversion, not two.

Also check EstateKit: the Tracking section shows a **Last reported** list. A
`Lead · sent · just now` line there means our side succeeded.

---

## Step 5 — Go live

Once you've seen both rows:

1. Back to the lead page → **Advanced tracking**
2. **Clear the test event code** (empty the field)
3. **Save**

The Test mode chip disappears. Real conversions now count toward ad delivery.

**Skipping this means nothing ever counts for real.** Test events are excluded
from optimisation by design.

---

## Checking it later

**In EstateKit:** Tracking → Last reported. `sent` is good, `failed` is not.

**In Meta:** Events Manager → your pixel → **Overview**. The Lead event should
show a **Server** share, not just Browser. Meta also shows an "Event Match
Quality" score — we send hashed email, phone, first/last name, country, plus
the Facebook click and browser IDs, which should land around Good.

---

## Troubleshooting

**Last reported shows `failed`**
Token is wrong or expired. Regenerate in Events Manager, paste it in again.
Tokens can be revoked when Business Manager permissions change.

**Nothing in Last reported at all**
No lead has been submitted since you turned it on, or the page has no Pixel ID.
Check the Pixel ID field directly above.

**Test events shows only Browser**
Our server didn't send. Check the toggle reads On, and that you submitted on the
real page and not the dashboard preview — the preview never records anything.

**Test events shows only Server**
The browser pixel was blocked. That's the whole point — CAPI caught a lead Meta
would otherwise never have heard about.

**Two conversions counted for one lead**
Shouldn't happen — both sides send the same event ID. If it does, tell me; it
means the dedupe key isn't matching.

---

## One deliberate behaviour

If an answer is ticked as a bad lead with **"Save the lead, but don't count it
on Facebook"**, that submission is **not** reported — not by the browser, and
refused again on the server even if something retries.

So your Ads Manager lead count will be **lower** than your EstateKit lead count
by however many were marked that way. That's working correctly, not a
discrepancy — but it will look like one if you forget.

---

## Where the token lives

In `fb_capi_config`, which is operator-only and has no public read policy.
Deliberately **not** on `lead_pages`: that table is publicly readable so the
landing page can render without a login, and a token there would be visible to
every visitor.

The dashboard never reads the token back — you can replace it, not copy it out.
If you need it again, generate a fresh one from Meta.

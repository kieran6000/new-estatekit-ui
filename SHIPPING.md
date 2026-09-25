# Shipping changes without clients seeing bugs

There is one database, on purpose. You test on a private copy of the website
first. Clients only see a change when you merge it into `main`.

```
push to "dev"         ->  private preview link  ->  same live database, only you logged in
tested, happy?
merge dev into main   ->  leads.estatekit.co    ->  clients see it
```

---

## 1. Every day

1. Make changes on the `dev` branch, never on `main`.
2. Push `dev`. Vercel builds a **preview link** for it automatically. Find it in
   Vercel, under the project's Deployments tab, as the newest "Preview".
3. Open the preview link. A **yellow bar** at the top says
   *"PREVIEW - live data. Clients can't see this link."* If you don't see the
   bar, you're on the real site.
4. Log in as **yourself** and test.
5. When you're happy, merge `dev` into `main` (a pull request on GitHub, then
   "Merge"). Vercel puts it live in about a minute. **This merge is the only
   moment clients see anything.**
6. If something breaks after a merge: in Vercel's Deployments tab, open the
   previous production deployment, click the three dots, then **Promote to
   Production**. The old version is back in seconds. Then fix it on `dev`.

**First time only:** if the preview link shows a blank white page, your
Supabase settings (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
`VITE_PUBLIC_POSTHOG_KEY`, `VITE_PUBLIC_POSTHOG_HOST`)
are only set for Production. In Vercel, go to Settings, then Environment
Variables, and tick **Preview** on each one.

---

## 2. Your sandbox

The preview uses real data, so test only on things that are yours:

- **Your own operator account.**
- **Your demo pages:** `megan-demo`, `dddddd`.
- **Test leads with your own phone number**, so any WhatsApp that fires comes
  to you, not a client.

Never test on an agent's account from the preview. Switching into an agent's
account there changes their real data.

---

## 3. Shipping a feature only you can see

Sometimes you want a feature on the live site but hidden from agents while
you try it for real. Wrap it like this:

```tsx
import { useOperatorPreview } from "../hooks/useOperatorPreview";

const showNewThing = useOperatorPreview();   // true only for operators
return <>{showNewThing && <NewThing />}</>;
```

It checks the person actually signed in, so it still shows when you've
switched into an agent's account, and agents never see it. To release it to
everyone, delete the check.

---

## 4. Database changes: add first, remove later

With one database, the old website and the new website both talk to it
during a release. So every database change is split in two:

**Release 1 (add):** add the new column or table. Nothing old is renamed or
removed. The old website keeps working because it doesn't know the new thing
exists. Ship the website change that uses it.

**Release 2 (remove), days later:** once the new version has been live and
fine, remove what's no longer used.

*Example: renaming `next_label` to `next_step`.*
- Release 1: add `next_step`, copy the values across, and make the website
  write both and read `next_step`.
- Release 2: stop writing `next_label`, then drop it.
- **Never** rename in one go. The live site would break the second the
  rename runs.

**Dry run before running for real.** In Supabase, open the SQL editor and wrap
the change like this:

```sql
begin;
  -- your change here
  -- a select that proves it did what you expected
rollback;   -- undoes everything
```

It undoes everything, but it briefly locks the tables it touches, so do it
outside office hours.

Changes go in `supabase/migrations/` as dated files. The full current
structure is in `supabase/schema/` for reference. **Never run the schema
snapshot against production.** It's a record, not a migration.

---

## 5. Edge functions (the backend)

**Pushing to `main` does not deploy edge functions.** Each function goes live
the moment you deploy it. There's no preview. So:

1. Keep function changes small and one at a time.
2. For anything risky, deploy a copy under a new name first, test it by
   calling it directly, then deploy the real one:
   ```
   npx supabase functions deploy run-automations --project-ref yfcnsvrhojpysrzqrkdi --use-api
   ```
3. **To roll back:** check out the previous version from git and deploy it
   again. It takes about 30 seconds.
4. Every live function now has its source in `supabase/functions/`. Keep it
   that way: never edit a function in the Supabase dashboard.

---

## 6. What one database does NOT protect you from

- **A bad database change hits everyone at once.** That's why section 4
  exists. Dry-run first, add before remove.
- **Edge functions have no preview.** A deploy is live immediately.
- **The preview can change real data.** It only changes yours if you only use
  your own account (section 2).
- **Scheduled jobs (cron) always run against the live database,** whatever
  branch you're on.

# EstateKit

Lead management for South African estate agents. Ads (Facebook instant forms, or
EstateKit landing pages) produce leads. The agent gets a WhatsApp alert with a
one-tap link, calls, and logs what happened. Automations follow up.

Live at **https://leads.estatekit.co**. The backend is Supabase (project
`yfcnsvrhojpysrzqrkdi`). This is the production app. The folder name
`web-react-mock` is historical; there's no mock mode any more.

**Full reference (UI, code, database, functions, playbooks):
[ESTATEKIT-SYSTEM-REFERENCE.md](ESTATEKIT-SYSTEM-REFERENCE.md).**
Start there, and give that file to any new Claude chat.

## Run it

```bash
npm install
cp .env.example .env     # fill in the Supabase URL + anon key
npm run dev
```

Log in with a real account (phone + password). There's no demo login.

| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check + production build. Must pass before pushing. |
| `npm run lint` | Oxlint |

## Shipping

There's one database. Work on `dev`, test the Vercel preview link (it shows a
yellow PREVIEW bar), and merge to `main` to go live. Database changes are
add-only. Details: [SHIPPING.md](SHIPPING.md).

## Other docs

- [AUDIT-2026-09-25.md](AUDIT-2026-09-25.md): security and bug audit, plus the backlog
- [CAPI-SETUP.md](CAPI-SETUP.md): Facebook Conversions API setup
- [SPEC-multi-page-agents.md](SPEC-multi-page-agents.md): agents with more than one Facebook page
- `supabase/schema/`: full database structure snapshot (reference only, never run it)
- `estatekit-sheets-backend/`: **legacy** Google Apps Script backend, not used by the live app

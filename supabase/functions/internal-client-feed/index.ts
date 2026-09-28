// Read-only feed for the internal service dashboard (a separate app on the
// old Supabase project). Everything it shows about a client's leads, pages,
// email and set-up comes from here, so there is only ever one copy.
//
//   GET /functions/v1/internal-client-feed            → every client
//   GET /functions/v1/internal-client-feed?agent=<id> → one client
//   Header: x-internal-key: <INTERNAL_FEED_KEY>
//
// Server-to-server only: call it from the internal dashboard's backend, never
// from a browser, so the key stays secret. Counts only; no lead names,
// numbers or emails leave through here.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const APP = "https://leads.estatekit.co";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

/** Constant-time compare, so the key can't be guessed a character at a time. */
function sameKey(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

const digits = (s: string | null | undefined) => {
  const d = (s || "").replace(/\D/g, "");
  return d.length === 10 && d.startsWith("0") ? "27" + d.slice(1) : d;
};

// Set-up checklist. KEEP IN STEP with src/lib/setup.ts.
const isCellphone = (s: string | null | undefined) => {
  const d = digits(s);
  return d.startsWith("27") ? /^27[6-8]\d{8}$/.test(d) : /^[1-9]\d{8,14}$/.test(d);
};
function setup(p: Profile, sales: number) {
  const items: Record<string, boolean> = {
    photo: /^https:\/\//.test(p.avatar_url || ""),
    sales: sales >= 3,
    name: (p.display_name || "").trim().split(/\s+/).filter(Boolean).length >= 2,
    whatsapp: isCellphone(p.whatsapp_number),
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((p.email || "").trim()),
    agency: !!(p.company || "").trim(),
  };
  const missing = Object.keys(items).filter((k) => !items[k]);
  return { done: 6 - missing.length, total: 6, missing };
}

/** Reads every row (Supabase returns at most 1000 per request). */
async function all<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await query(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

interface Profile {
  agent_id: string;
  display_name: string | null;
  company: string | null;
  area: string | null;
  email: string | null;
  whatsapp_number: string | null;
  avatar_url: string | null;
  fb_page_id: string | null;
  fb_ad_account_id: string | null;
  lead_confirmation_email: boolean;
  automations_paused: boolean;
  created_at?: string;
}

Deno.serve(async (req) => {
  if (req.method !== "GET") return json({ error: "GET only" }, 405);
  const expected = Deno.env.get("INTERNAL_FEED_KEY") || "";
  if (!expected) return json({ error: "not configured" }, 503);
  if (!sameKey(req.headers.get("x-internal-key") || "", expected)) return json({ error: "unauthorized" }, 401);

  const one = new URL(req.url).searchParams.get("agent");
  if (one && !/^[0-9a-f-]{36}$/i.test(one)) return json({ error: "bad agent id" }, 400);

  let q = supabase
    .from("agent_profiles")
    .select("agent_id, display_name, company, area, email, whatsapp_number, avatar_url, fb_page_id, fb_ad_account_id, lead_confirmation_email, automations_paused")
    .eq("is_operator", false);
  if (one) q = q.eq("agent_id", one);
  const { data: profiles, error } = await q;
  if (error) return json({ error: "read failed" }, 500);
  const ids = (profiles as Profile[]).map((p) => p.agent_id);
  if (!ids.length) return json({ clients: [] });

  const since30 = new Date(Date.now() - 30 * 864e5).toISOString();
  const [pages, sold, signups, dossiers, leads, events] = await Promise.all([
    supabase.from("lead_pages").select("agent_id, name, slug, created_at").in("agent_id", ids),
    supabase.from("sold_listings").select("agent_id").in("agent_id", ids),
    supabase.from("signup_requests").select("created_at, name, whatsapp, email, agency, wants, city, suburbs, budget, status"),
    supabase.from("client_dossiers").select("agent_id, data").in("agent_id", ids),
    all<{ agent_id: string; stage: string; created_at: string }>((a, b) =>
      supabase.from("leads").select("agent_id, stage, created_at").in("agent_id", ids).eq("archived", false).order("id").range(a, b)),
    all<{ agent_id: string; lead_id: string; event_type: string }>((a, b) =>
      supabase.from("lead_events").select("agent_id, lead_id, event_type").in("agent_id", ids).gt("created_at", since30)
        .in("event_type", ["email_sent", "email_opened", "plan_opened", "email_clicked"]).order("id").range(a, b)),
  ]);

  const byAgent = <T extends { agent_id: string }>(rows: T[] | null) => {
    const m = new Map<string, T[]>();
    for (const r of rows ?? []) m.set(r.agent_id, [...(m.get(r.agent_id) ?? []), r]);
    return m;
  };
  const pagesBy = byAgent(pages.data);
  const soldBy = byAgent(sold.data);
  const leadsBy = byAgent(leads);
  const eventsBy = byAgent(events);
  const dossierBy = new Map((dossiers.data ?? []).map((d) => [d.agent_id, d.data]));

  const clients = await Promise.all(
    (profiles as Profile[]).map(async (p) => {
      // The brief: the /start sign-up answers (matched on WhatsApp number or
      // email), else the older onboarding form kept in the client's dossier.
      const wa = digits(p.whatsapp_number);
      const signup = (signups.data ?? []).find(
        (s) => (wa && digits(s.whatsapp) === wa) || (s.email && p.email && s.email.toLowerCase() === p.email.toLowerCase()),
      );
      const oldForm = (dossierBy.get(p.agent_id) as { onboarding?: { q: string; a: string }[] } | undefined)?.onboarding ?? null;
      const brief = signup
        ? {
            source: "signup",
            submittedAt: signup.created_at,
            wants: signup.wants,
            city: signup.city,
            suburbs: signup.suburbs,
            budget: signup.budget,
            agency: signup.agency,
          }
        : oldForm
          ? { source: "onboarding_form", answers: oldForm }
          : null;

      const myLeads = leadsBy.get(p.agent_id) ?? [];
      const byStage: Record<string, number> = {};
      for (const l of myLeads) byStage[l.stage] = (byStage[l.stage] ?? 0) + 1;
      const now = Date.now();
      const lastLead = myLeads.reduce<string | null>((m, l) => (!m || l.created_at > m ? l.created_at : m), null);

      const ev = eventsBy.get(p.agent_id) ?? [];
      const leadsWith = (t: string) => new Set(ev.filter((e) => e.event_type === t).map((e) => e.lead_id)).size;

      const [week, month] = await Promise.all([
        supabase.rpc("get_agent_results", { p_agent: p.agent_id, p_days: 7 }),
        supabase.rpc("get_agent_results", { p_agent: p.agent_id, p_days: 30 }),
      ]);

      return {
        agentId: p.agent_id,
        name: p.display_name,
        agency: p.company,
        area: p.area,
        email: p.email,
        whatsapp: p.whatsapp_number,
        photo: p.avatar_url,
        ids: { adAccountId: p.fb_ad_account_id, pageId: p.fb_page_id },
        landingPages: (pagesBy.get(p.agent_id) ?? []).map((pg) => ({ name: pg.name, url: `${APP}/p/${pg.slug}` })),
        setup: setup(p, (soldBy.get(p.agent_id) ?? []).length),
        brief,
        leads: {
          total: myLeads.length,
          last7d: myLeads.filter((l) => now - Date.parse(l.created_at) < 7 * 864e5).length,
          last30d: myLeads.filter((l) => now - Date.parse(l.created_at) < 30 * 864e5).length,
          lastLeadAt: lastLead,
          byStage,
        },
        results: { week: week.data ?? null, month: month.data ?? null },
        email: {
          on: p.lead_confirmation_email,
          last30d: {
            sent: leadsWith("email_sent"),
            opened: leadsWith("email_opened"),
            planOpened: leadsWith("plan_opened"),
            tappedWhatsApp: leadsWith("email_clicked"),
          },
        },
        automationsPaused: p.automations_paused,
      };
    }),
  );

  return json({ generatedAt: new Date().toISOString(), clients: one ? clients : clients.sort((a, b) => (a.name || "").localeCompare(b.name || "")) });
});

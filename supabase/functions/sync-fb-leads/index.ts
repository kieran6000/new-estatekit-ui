import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const supabase = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
};

const GRAPH = "https://graph.facebook.com/v21.0";
const TOKEN_NAMES = ["FB_ACCESS_TOKEN", "FB_ACCESS_TOKEN_2"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

interface FieldDatum { name: string; values: string[] }
interface FbLead { id: string; created_time: string; field_data: FieldDatum[] }

const RATE_LIMIT_CODES = new Set([4, 17, 32, 613]);

/** Facebook is throttling the whole app — stop everything until this passes.
 *  Each call made while throttled spends quota that is already gone, which is
 *  how a short throttle turned into a permanent one. */
async function backoffActive(): Promise<boolean> {
  const { data } = await supabase.from("fb_api_state").select("backoff_until").eq("id", true).maybeSingle();
  return !!data?.backoff_until && new Date(data.backoff_until) > new Date();
}

async function startBackoff(minutes: number, reason: string): Promise<void> {
  await supabase.from("fb_api_state").update({
    backoff_until: new Date(Date.now() + minutes * 60_000).toISOString(),
    last_error: reason.slice(0, 500),
    updated_at: new Date().toISOString(),
  }).eq("id", true);
}

function rateLimitCode(data: { error?: { code?: number } }): boolean {
  return !!data?.error?.code && RATE_LIMIT_CODES.has(data.error.code);
}

/**
 * Page tokens, cached in the database.
 *
 * These are derived from long-lived user tokens and don't change, yet this
 * resolved them by paging me/accounts?limit=200 — our single most expensive
 * call — once per agent, every run, every 5 minutes. That one lookup was the
 * bulk of the app's Facebook quota.
 *
 * Now Graph is only consulted when there's no cached token for the page.
 */
async function getPageToken(pageId: string, tokens: string[]): Promise<string | null> {
  const { data: cached } = await supabase
    .from("fb_page_tokens").select("access_token").eq("page_id", pageId).maybeSingle();
  if (cached?.access_token) return cached.access_token as string;

  for (const userToken of tokens) {
    // Ask for this page directly before falling back to listing every page the
    // token can see — one call instead of potentially several.
    const direct = await fetch(`${GRAPH}/${pageId}?fields=access_token&access_token=${userToken}`);
    const directData = await direct.json();
    if (rateLimitCode(directData)) {
      await startBackoff(20, directData.error?.message ?? "rate limited");
      return null;
    }
    if (direct.ok && directData?.access_token) {
      await cachePageToken(pageId, directData.access_token);
      return directData.access_token as string;
    }

    let url: string | null = `${GRAPH}/me/accounts?fields=id,access_token&limit=200&access_token=${userToken}`;
    while (url) {
      const res = await fetch(url);
      const data = await res.json();
      if (rateLimitCode(data)) {
        await startBackoff(20, data.error?.message ?? "rate limited");
        return null;
      }
      if (!res.ok || data.error) break;
      const match = (data.data || []).find((p: { id: string }) => p.id === pageId);
      if (match?.access_token) {
        await cachePageToken(pageId, match.access_token);
        return match.access_token as string;
      }
      url = data.paging?.next ?? null;
    }
  }
  return null;
}

async function cachePageToken(pageId: string, token: string): Promise<void> {
  await supabase.from("fb_page_tokens").upsert(
    { page_id: pageId, access_token: token, updated_at: new Date().toISOString() },
    { onConflict: "page_id" },
  );
}

function extract(fieldData: FieldDatum[]) {
  const map: Record<string, string> = {};
  for (const f of fieldData) map[f.name.toLowerCase()] = f.values?.[0] || "";
  const name = map["full_name"] || map["name"] || `${map["first_name"] || ""} ${map["last_name"] || ""}`.trim() || "Unknown";
  const phone = map["phone_number"] || map["phone"] || "";
  const email = map["email"] || "";
  const skip = new Set(["full_name", "name", "first_name", "last_name", "phone_number", "phone", "email"]);
  const answers = fieldData.filter((f) => !skip.has(f.name.toLowerCase())).map((f) => ({
    q: f.name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    a: f.values?.[0] || "",
  }));
  return { name, phone, email, answers };
}

// Only ping Discord for genuinely fresh leads — keeps backfills silent.
async function maybeNotify(agentId: string, lead: Record<string, unknown>, createdTime: string, silent: boolean) {
  if (silent) return;
  const created = createdTime ? Date.parse(createdTime) : Date.now();
  if (Number.isFinite(created) && Date.now() - created > 20 * 60 * 1000) return;
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/track-activity`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "new_lead", agentId, lead }),
    });
  } catch { /* best-effort */ }
}

async function fetchFormLeads(formId: string, token: string, sinceFilter: string): Promise<FbLead[] | null> {
  const out: FbLead[] = [];
  let url: string | null = `${GRAPH}/${formId}/leads?fields=id,created_time,field_data&limit=200${sinceFilter}&access_token=${token}`;
  while (url) {
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok || data.error) return null;
    for (const l of data.data || []) out.push(l);
    url = data.paging?.next ?? null;
  }
  return out;
}

async function insertLead(row: Record<string, unknown>): Promise<{ id: string } | "dup" | "err"> {
  const { data, error } = await supabase.from("leads").insert(row).select("id").single();
  if (!error) return data as { id: string };
  if (error.code === "23505" || error.message.includes("duplicate")) return "dup";
  console.error("insert failed:", error.message);
  return "err";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    const b = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const onlyAgentId: string | null = b.agentId ?? null;
    const onlyFormId: string | null = b.formId ?? null;
    // Without a window this asked Facebook for every lead a form has ever
    // collected, every run — 544 leads paged 200 at a time, to insert none of
    // them, every 15 minutes. The poll only exists to catch what the webhook
    // dropped, so a week is generous; anything older is a backfill, and a
    // backfill can pass sinceDays explicitly.
    const DEFAULT_SINCE_DAYS = 7;
    const sinceDays: number = typeof b.sinceDays === "number" ? b.sinceDays : DEFAULT_SINCE_DAYS;
    const includePageForms: boolean = b.includePageForms === true;
    const silent: boolean = b.silent === true;
    const sinceFilter = sinceDays && sinceDays > 0
      ? `&filtering=${encodeURIComponent(JSON.stringify([{ field: "time_created", operator: "GREATER_THAN", value: Math.floor(Date.now() / 1000) - sinceDays * 86400 }]))}`
      : "";

    // Nothing at all while Facebook is throttling the app. The webhook still
    // delivers leads in the meantime; this poll is only the safety net.
    if (await backoffActive()) {
      return json({ skipped: "facebook backoff active", inserted: 0 });
    }

    const tokens: string[] = [];
    for (const name of TOKEN_NAMES) {
      const { data } = await supabase.rpc("get_secret", { secret_name: name });
      if (data) tokens.push(data);
    }
    if (tokens.length === 0) return json({ error: "No FB token configured" }, 500);

    const summary: Record<string, unknown>[] = [];
    let totalInserted = 0;
    const pageTokenCache: Record<string, string | null> = {};

    async function pageToken(pageId: string): Promise<string | null> {
      if (!(pageId in pageTokenCache)) pageTokenCache[pageId] = await getPageToken(pageId, tokens);
      return pageTokenCache[pageId];
    }

    // ---- 1) Explicitly connected fb_form lead pages (one form each) ----
    let q = supabase.from("lead_pages")
      .select("id, agent_id, pipeline_id, fb_form_id, fb_form_name, fb_page_id")
      .eq("source_type", "fb_form").not("fb_form_id", "is", null);
    if (onlyAgentId) q = q.eq("agent_id", onlyAgentId);
    if (onlyFormId) q = q.eq("fb_form_id", onlyFormId);
    const { data: pages, error: pagesErr } = await q;
    if (pagesErr) return json({ error: pagesErr.message }, 500);

    for (const page of pages || []) {
      const formId = page.fb_form_id as string;
      // The source knows which page its form lives on; the agent profile is
      // only the default. Resolving the profile page for a form that lives
      // elsewhere meant a page-token lookup that could never match, spending
      // quota before falling back to raw user tokens.
      let fbPageId = (page as { fb_page_id?: string | null }).fb_page_id ?? undefined;
      if (!fbPageId) {
        const { data: prof } = await supabase.from("agent_profiles").select("fb_page_id").eq("agent_id", page.agent_id).maybeSingle();
        fbPageId = prof?.fb_page_id as string | undefined;
      }
      const pt = fbPageId ? await pageToken(fbPageId) : null;
      const tryTokens = pt ? [pt, ...tokens] : [...tokens];

      let leads: FbLead[] | null = null;
      for (const t of tryTokens) { leads = await fetchFormLeads(formId, t, sinceFilter); if (leads) break; }
      if (!leads) { summary.push({ form: page.fb_form_name || formId, error: "fetch failed" }); continue; }

      let pipelineName: string | undefined;
      if (page.pipeline_id) {
        const { data: pl } = await supabase.from("pipelines").select("name").eq("id", page.pipeline_id).maybeSingle();
        pipelineName = pl?.name;
      }
      let inserted = 0;
      for (const l of leads) {
        const { name, phone, email, answers } = extract(l.field_data || []);
        const r = await insertLead({ agent_id: page.agent_id, name, phone, email, stage: "New Lead", next_label: "Just came in", due: true, form_answers: answers, pipeline_id: page.pipeline_id, source_page_id: page.id, fb_lead_id: l.id, created_at: l.created_time || undefined });
        if (r === "dup") { if (l.created_time) await supabase.from("leads").update({ created_at: l.created_time }).eq("fb_lead_id", l.id); }
        else if (r !== "err") { inserted++; const address = answers.find((a) => /address/i.test(a.q))?.a; await maybeNotify(page.agent_id, { id: r.id, name, phone, address, pipeline: pipelineName, source: "Facebook form" }, l.created_time, silent); }
      }
      totalInserted += inserted;
      summary.push({ form: page.fb_form_name || formId, fetched: leads.length, inserted });
    }

    // ---- 2) Page-level pull: every form on an agent's OWN page ----
    // Skips pages shared by more than one agent (ambiguous attribution).
    if (includePageForms) {
      let aq = supabase.from("agent_profiles").select("agent_id, fb_page_id, display_name").not("fb_page_id", "is", null).neq("fb_page_id", "");
      if (onlyAgentId) aq = aq.eq("agent_id", onlyAgentId);
      const { data: agents } = await aq;

      for (const a of agents || []) {
        const fbPageId = a.fb_page_id as string;
        const { count } = await supabase.from("agent_profiles").select("agent_id", { count: "exact", head: true }).eq("fb_page_id", fbPageId);
        if ((count ?? 0) > 1) { summary.push({ agent: a.display_name, skipped: "shared page" }); continue; }

        const pt = await pageToken(fbPageId);
        const tryTokens = pt ? [pt, ...tokens] : [...tokens];

        // seller pipeline (fallback: first pipeline)
        const { data: pls } = await supabase.from("pipelines").select("id, kind, created_at").eq("agent_id", a.agent_id).order("created_at", { ascending: true });
        const pipelineId = pls?.find((p) => p.kind === "seller")?.id ?? pls?.[0]?.id ?? null;

        // list forms on the page
        let forms: { id: string; name: string }[] | null = null;
        for (const t of tryTokens) {
          const res = await fetch(`${GRAPH}/${fbPageId}/leadgen_forms?fields=id,name&limit=200&access_token=${t}`);
          const data = await res.json();
          if (rateLimitCode(data)) {
            await startBackoff(20, data.error?.message ?? "rate limited");
            return json({ stopped: "facebook rate limit", inserted: totalInserted, summary });
          }
          if (res.ok && !data.error) { forms = (data.data || []).map((f: { id: string; name: string }) => ({ id: f.id, name: f.name })); break; }
        }
        if (!forms) { summary.push({ agent: a.display_name, error: "forms fetch failed" }); continue; }

        // Only forms that have ever produced a lead for this agent, plus
        // anything created recently enough to still be worth watching.
        //
        // A page accumulates every form an agent has ever made — old campaigns,
        // duplicates, tests. Polling all of them every run meant most calls
        // came back empty forever, and that volume is what exhausted the app's
        // quota. Forms that have never delivered a lead are picked up by the
        // webhook instead, which costs nothing.
        const { data: seen } = await supabase
          .from("leads").select("fb_lead_id").eq("agent_id", a.agent_id)
          .not("fb_lead_id", "is", null).limit(1);
        if (seen && seen.length > 0) {
          const { data: activeForms } = await supabase
            .from("lead_pages").select("fb_form_id").eq("agent_id", a.agent_id).not("fb_form_id", "is", null);
          const linked = new Set((activeForms ?? []).map((f) => f.fb_form_id as string));
          if (linked.size > 0) forms = forms.filter((f) => linked.has(f.id));
        }

        let inserted = 0;
        for (const form of forms) {
          let leads: FbLead[] | null = null;
          for (const t of tryTokens) { leads = await fetchFormLeads(form.id, t, sinceFilter); if (leads) break; }
          if (!leads) continue;
          for (const l of leads) {
            const { name, phone, email, answers } = extract(l.field_data || []);
            const r = await insertLead({ agent_id: a.agent_id, name, phone, email, stage: "New Lead", next_label: "Just came in", due: true, form_answers: answers, pipeline_id: pipelineId, fb_lead_id: l.id, created_at: l.created_time || undefined });
            if (r === "dup") { if (l.created_time) await supabase.from("leads").update({ created_at: l.created_time }).eq("fb_lead_id", l.id); }
            else if (r !== "err") { inserted++; const address = answers.find((x) => /address/i.test(x.q))?.a; await maybeNotify(a.agent_id, { id: r.id, name, phone, address, source: "Facebook form" }, l.created_time, silent); }
          }
        }
        totalInserted += inserted;
        summary.push({ agent: a.display_name, forms: forms.length, inserted });
      }
    }

    return json({ ok: true, totalInserted, summary });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

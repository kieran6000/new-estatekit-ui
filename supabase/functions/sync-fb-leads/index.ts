import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
};

const GRAPH = "https://graph.facebook.com/v21.0";
const TOKEN_NAMES = ["FB_ACCESS_TOKEN", "FB_ACCESS_TOKEN_2"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

interface FieldDatum { name: string; values: string[] }

// Resolve the page-specific access token for pageId from any user token.
async function getPageToken(pageId: string, tokens: string[]): Promise<string | null> {
  for (const userToken of tokens) {
    let url: string | null =
      `${GRAPH}/me/accounts?fields=id,access_token&limit=200&access_token=${userToken}`;
    while (url) {
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok || data.error) break;
      const match = (data.data || []).find((p: { id: string }) => p.id === pageId);
      if (match?.access_token) return match.access_token as string;
      url = data.paging?.next ?? null;
    }
  }
  return null;
}

function extract(fieldData: FieldDatum[]) {
  const map: Record<string, string> = {};
  for (const f of fieldData) map[f.name.toLowerCase()] = f.values?.[0] || "";
  const name =
    map["full_name"] ||
    map["name"] ||
    `${map["first_name"] || ""} ${map["last_name"] || ""}`.trim() ||
    "Unknown";
  const phone = map["phone_number"] || map["phone"] || "";
  const email = map["email"] || "";
  const skip = new Set(["full_name", "name", "first_name", "last_name", "phone_number", "phone", "email"]);
  const answers = fieldData
    .filter((f) => !skip.has(f.name.toLowerCase()))
    .map((f) => ({
      q: f.name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      a: f.values?.[0] || "",
    }));
  return { name, phone, email, answers };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const bodyIn = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const onlyAgentId: string | null = bodyIn.agentId ?? null;
    const onlyFormId: string | null = bodyIn.formId ?? null;
    // Scheduled runs pass sinceDays to only pull recent leads; manual
    // backfills omit it to pull everything (dedup handles repeats).
    const sinceDays: number | null = typeof bodyIn.sinceDays === "number" ? bodyIn.sinceDays : null;
    const sinceFilter =
      sinceDays && sinceDays > 0
        ? `&filtering=${encodeURIComponent(JSON.stringify([{ field: "time_created", operator: "GREATER_THAN", value: Math.floor(Date.now() / 1000) - sinceDays * 86400 }]))}`
        : "";

    const tokens: string[] = [];
    for (const name of TOKEN_NAMES) {
      const { data } = await supabase.rpc("get_secret", { secret_name: name });
      if (data) tokens.push(data);
    }
    if (tokens.length === 0) return json({ error: "No FB token configured" }, 500);

    // Every connected form, with its owning agent + page + pipeline.
    let q = supabase
      .from("lead_pages")
      .select("id, agent_id, pipeline_id, fb_form_id, fb_form_name")
      .eq("source_type", "fb_form")
      .not("fb_form_id", "is", null);
    if (onlyAgentId) q = q.eq("agent_id", onlyAgentId);
    if (onlyFormId) q = q.eq("fb_form_id", onlyFormId);
    const { data: pages, error: pagesErr } = await q;
    if (pagesErr) return json({ error: pagesErr.message }, 500);

    const summary: Record<string, unknown>[] = [];
    let totalInserted = 0;

    // Cache page tokens per fb_page_id.
    const pageTokenCache: Record<string, string | null> = {};

    for (const page of pages || []) {
      const formId = page.fb_form_id as string;

      // Which FB page does this agent use?
      const { data: prof } = await supabase
        .from("agent_profiles")
        .select("fb_page_id")
        .eq("agent_id", page.agent_id)
        .maybeSingle();
      const fbPageId = prof?.fb_page_id as string | undefined;

      let token: string | null = null;
      if (fbPageId) {
        if (!(fbPageId in pageTokenCache)) {
          pageTokenCache[fbPageId] = await getPageToken(fbPageId, tokens);
        }
        token = pageTokenCache[fbPageId];
      }
      // Fall back to raw user tokens if we couldn't resolve a page token.
      const tryTokens = token ? [token, ...tokens] : [...tokens];

      let fbLeads: { id: string; created_time: string; field_data: FieldDatum[] }[] | null = null;
      let lastErr = "";
      for (const t of tryTokens) {
        try {
          const out: typeof fbLeads = [];
          let url: string | null = `${GRAPH}/${formId}/leads?fields=id,created_time,field_data&limit=200${sinceFilter}&access_token=${t}`;
          let ok = true;
          while (url) {
            const res = await fetch(url);
            const data = await res.json();
            if (!res.ok || data.error) { ok = false; lastErr = data.error?.message || `HTTP ${res.status}`; break; }
            for (const l of data.data || []) out.push(l);
            url = data.paging?.next ?? null;
          }
          if (ok) { fbLeads = out; break; }
        } catch (e) {
          lastErr = String(e);
        }
      }

      if (fbLeads === null) {
        summary.push({ form: page.fb_form_name || formId, error: lastErr });
        continue;
      }

      // Pipeline name (once per form) for richer activity cards.
      let pipelineName: string | undefined;
      if (page.pipeline_id) {
        const { data: pl } = await supabase.from("pipelines").select("name").eq("id", page.pipeline_id).maybeSingle();
        pipelineName = pl?.name;
      }

      let inserted = 0;
      for (const l of fbLeads) {
        const { name, phone, email, answers } = extract(l.field_data || []);
        const { data: newLead, error: insErr } = await supabase.from("leads").insert({
          agent_id: page.agent_id,
          name,
          phone,
          email,
          stage: "New Lead",
          next_label: "Just came in",
          due: true,
          form_answers: answers,
          pipeline_id: page.pipeline_id,
          source_page_id: page.id,
          fb_lead_id: l.id,
          created_at: l.created_time || undefined,
        }).select("id").single();
        // Unique violation on fb_lead_id => already imported; skip quietly.
        if (!insErr) {
          inserted++;
          const address = answers.find((a) => /address/i.test(a.q))?.a;
          try {
            await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/track-activity`, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ event: "new_lead", agentId: page.agent_id, lead: { id: newLead?.id, name, phone, address, pipeline: pipelineName, source: "Facebook form" } }),
            });
          } catch { /* best-effort */ }
        }
        else if (insErr.code === "23505" || insErr.message.includes("duplicate")) {
          // Already imported. Backfill created_at to the real FB time if we
          // stamped it with the import time on an earlier run. Updating a
          // non-stage field does not re-trigger automations.
          if (l.created_time) {
            await supabase.from("leads").update({ created_at: l.created_time }).eq("fb_lead_id", l.id);
          }
        } else {
          console.error(`insert failed for lead ${l.id}: ${insErr.message}`);
        }
      }
      totalInserted += inserted;
      summary.push({ form: page.fb_form_name || formId, fetched: fbLeads.length, inserted });
    }

    return json({ ok: true, totalInserted, forms: summary });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

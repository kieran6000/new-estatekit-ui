import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FB_VERIFY_TOKEN = Deno.env.get("FB_VERIFY_TOKEN") || "estatekit_webhook_2024";
const TOKEN_NAMES = ["FB_ACCESS_TOKEN", "FB_ACCESS_TOKEN_2"];

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

let _tokens: string[] | null = null;
async function getTokens(): Promise<string[]> {
  if (_tokens) return _tokens;
  const out: string[] = [];
  const env = Deno.env.get("FB_ACCESS_TOKEN");
  if (env) out.push(env);
  for (const name of TOKEN_NAMES) {
    const { data } = await supabase.rpc("get_secret", { secret_name: name });
    if (data && !out.includes(data)) out.push(data);
  }
  _tokens = out;
  return out;
}

async function getPageToken(pageId: string): Promise<string | null> {
  const tokens = await getTokens();
  for (const userToken of tokens) {
    let url: string | null = `https://graph.facebook.com/v21.0/me/accounts?fields=id,access_token&limit=200&access_token=${userToken}`;
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

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token === FB_VERIFY_TOKEN) {
      console.log("Webhook verified");
      return new Response(challenge, { status: 200, headers: CORS });
    }
    return new Response("Forbidden", { status: 403, headers: CORS });
  }

  if (req.method === "POST") {
    try {
      const body = await req.json();
      console.log("FB webhook received:", JSON.stringify(body));
      if (body.object !== "page") {
        return new Response("Not a page event", { status: 200, headers: CORS });
      }

      for (const entry of body.entry || []) {
        const pageId = String(entry.id);
        for (const change of entry.changes || []) {
          if (change.field !== "leadgen") continue;
          const leadgenId = change.value?.leadgen_id;
          const formId = change.value?.form_id;
          if (!leadgenId) continue;

          console.log(`Lead ${leadgenId} from page ${pageId} form ${formId}`);

          // Attribute by form -> lead_page -> agent (correct for shared pages).
          let agentId: string | null = null;
          let agentName = "";
          let linkedPipelineId: string | null = null;
          let sourcePageRowId: string | null = null;

          if (formId) {
            const { data: linkedPage } = await supabase
              .from("lead_pages")
              .select("id, agent_id, pipeline_id")
              .eq("fb_form_id", String(formId))
              .limit(1)
              .maybeSingle();
            if (linkedPage) {
              agentId = linkedPage.agent_id;
              linkedPipelineId = linkedPage.pipeline_id;
              sourcePageRowId = linkedPage.id;
            }
          }

          if (!agentId) {
            const { data: agents } = await supabase
              .from("agent_profiles")
              .select("agent_id, display_name")
              .eq("fb_page_id", pageId)
              .limit(1);
            if (agents && agents.length) {
              agentId = agents[0].agent_id;
              agentName = agents[0].display_name;
            }
          }

          if (!agentId) {
            console.warn(`No agent found for page ${pageId} / form ${formId}`);
            continue;
          }

          const { data: existing } = await supabase
            .from("leads")
            .select("id")
            .eq("fb_lead_id", String(leadgenId))
            .limit(1)
            .maybeSingle();
          if (existing) {
            console.log(`Lead ${leadgenId} already imported, skipping`);
            continue;
          }

          const leadData = await fetchFbLead(leadgenId, pageId);
          if (!leadData) {
            console.error(`Failed to fetch lead ${leadgenId} from FB`);
            continue;
          }

          const fields = extractFields(leadData.field_data || []);
          const name = fields.name || fields.full_name || `${fields.first_name || ""} ${fields.last_name || ""}`.trim() || "Unknown";
          const phone = fields.phone_number || fields.phone || "";
          const email = fields.email || "";

          let pipelineKind = "seller";
          if (!linkedPipelineId && formId) {
            const formName = await fetchFbFormName(formId, pageId);
            if (formName && /buyer|buy|purchase|viewing/i.test(formName)) pipelineKind = "buyer";
          }

          const { data: pipelines } = await supabase
            .from("pipelines")
            .select("id, kind")
            .eq("agent_id", agentId)
            .order("created_at", { ascending: true });

          const pipeline = linkedPipelineId
            ? pipelines?.find((p) => p.id === linkedPipelineId) || pipelines?.[0]
            : pipelines?.find((p) => p.kind === pipelineKind) || pipelines?.[0];

          const formAnswers = (leadData.field_data || [])
            .filter((f: { name: string }) => !["full_name", "first_name", "last_name", "phone_number", "email"].includes(f.name))
            .map((f: { name: string; values: string[] }) => ({
              q: f.name.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
              a: f.values?.[0] || "",
            }));

          const { error } = await supabase.from("leads").insert({
            agent_id: agentId,
            name,
            phone,
            email,
            stage: "New Lead",
            next_label: "Just came in",
            due: true,
            form_answers: formAnswers,
            pipeline_id: pipeline?.id || null,
            source_page_id: sourcePageRowId,
            fb_lead_id: String(leadgenId),
            created_at: leadData.created_time || undefined,
          });

          if (error) console.error(`Failed to insert lead: ${error.message}`);
          else console.log(`Lead created for agent ${agentName || agentId}: ${name} (${phone})`);
        }
      }

      return new Response("OK", { status: 200, headers: CORS });
    } catch (err) {
      console.error("Webhook error:", err);
      return new Response("Error", { status: 200, headers: CORS });
    }
  }

  return new Response("Method not allowed", { status: 405, headers: CORS });
});

async function fetchFbLead(leadgenId: string, pageId: string) {
  const pageToken = await getPageToken(pageId);
  const tokens = await getTokens();
  const candidates = pageToken ? [pageToken, ...tokens] : tokens;
  for (const token of candidates) {
    try {
      const res = await fetch(`https://graph.facebook.com/v21.0/${leadgenId}?fields=id,created_time,field_data&access_token=${token}`);
      if (res.ok) {
        const data = await res.json();
        if (!data.error) return data;
      }
    } catch (err) {
      console.error("FB fetch error:", err);
    }
  }
  return null;
}

async function fetchFbFormName(formId: string, pageId: string): Promise<string | null> {
  const pageToken = await getPageToken(pageId);
  const tokens = await getTokens();
  const candidates = pageToken ? [pageToken, ...tokens] : tokens;
  for (const token of candidates) {
    try {
      const res = await fetch(`https://graph.facebook.com/v21.0/${formId}?fields=name&access_token=${token}`);
      if (res.ok) {
        const data = await res.json();
        if (!data.error) return data.name || null;
      }
    } catch { /* try next */ }
  }
  return null;
}

function extractFields(fieldData: Array<{ name: string; values: string[] }>) {
  const out: Record<string, string> = {};
  for (const f of fieldData) {
    const key = f.name.toLowerCase().replace(/\s+/g, "_");
    out[key] = f.values?.[0] || "";
    if (key === "full_name") out.name = f.values?.[0] || "";
  }
  if (!out.name && (out.first_name || out.last_name)) {
    out.name = `${out.first_name || ""} ${out.last_name || ""}`.trim();
  }
  return out;
}

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FB_VERIFY_TOKEN = Deno.env.get("FB_VERIFY_TOKEN") || "estatekit_webhook_2024";
let _fbToken: string | null = null;
async function getFbToken(): Promise<string> {
  if (_fbToken) return _fbToken;
  const envToken = Deno.env.get("FB_ACCESS_TOKEN");
  if (envToken) { _fbToken = envToken; return envToken; }
  const { data } = await supabase.rpc("get_secret", { secret_name: "FB_ACCESS_TOKEN" });
  _fbToken = data || "";
  return _fbToken;
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  // GET = Facebook webhook verification challenge
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

  // POST = incoming lead event from Facebook
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

          // Look up which agent owns this page
          const { data: agent } = await supabase
            .from("agent_profiles")
            .select("agent_id, display_name")
            .eq("fb_page_id", pageId)
            .maybeSingle();

          if (!agent) {
            console.warn(`No agent found for page ${pageId}`);
            continue;
          }

          // Fetch the actual lead data from Facebook
          const leadData = await fetchFbLead(leadgenId);
          if (!leadData) {
            console.error(`Failed to fetch lead ${leadgenId} from FB`);
            continue;
          }

          // Extract fields from FB lead data
          const fields = extractFields(leadData.field_data || []);
          const name = fields.name || fields.full_name || `${fields.first_name || ""} ${fields.last_name || ""}`.trim() || "Unknown";
          const phone = fields.phone_number || fields.phone || "";
          const email = fields.email || "";

          // Find the agent's default pipeline (seller first, then any)
          const { data: pipelines } = await supabase
            .from("pipelines")
            .select("id, kind")
            .eq("agent_id", agent.agent_id)
            .order("created_at", { ascending: true });

          const pipeline = pipelines?.find((p) => p.kind === "seller") || pipelines?.[0];

          // Build form_answers from all FB fields
          const formAnswers = (leadData.field_data || [])
            .filter((f: { name: string }) => !["full_name", "first_name", "last_name", "phone_number", "email"].includes(f.name))
            .map((f: { name: string; values: string[] }) => ({
              q: f.name.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
              a: f.values?.[0] || "",
            }));

          // Insert the lead
          const { error } = await supabase.from("leads").insert({
            agent_id: agent.agent_id,
            name,
            phone,
            email,
            stage: "New Lead",
            next_label: "Just came in",
            due: true,
            form_answers: formAnswers,
            pipeline_id: pipeline?.id || null,
          });

          if (error) {
            console.error(`Failed to insert lead: ${error.message}`);
          } else {
            console.log(`Lead created for agent ${agent.display_name}: ${name} (${phone})`);
          }
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

async function fetchFbLead(leadgenId: string) {
  const token = await getFbToken();
  if (!token) {
    console.error("No FB_ACCESS_TOKEN configured");
    return null;
  }
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${leadgenId}?access_token=${token}`,
    );
    if (!res.ok) {
      console.error(`FB API error ${res.status}: ${await res.text()}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error("FB fetch error:", err);
    return null;
  }
}

function extractFields(fieldData: Array<{ name: string; values: string[] }>) {
  const out: Record<string, string> = {};
  for (const f of fieldData) {
    const key = f.name.toLowerCase().replace(/\s+/g, "_");
    out[key] = f.values?.[0] || "";
    // Build combined name field
    if (key === "full_name") out.name = f.values?.[0] || "";
  }
  if (!out.name && (out.first_name || out.last_name)) {
    out.name = `${out.first_name || ""} ${out.last_name || ""}`.trim();
  }
  return out;
}

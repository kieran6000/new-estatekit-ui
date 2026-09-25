import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// REDACTED when pulled into git (25 Sept). The deployed function has this
// webhook hardcoded. Set the DISCORD_SUPPORT_WEBHOOK secret before
// redeploying from the repo, or support-ticket posts to Discord will stop.
const DISCORD_SUPPORT_WEBHOOK = Deno.env.get("DISCORD_SUPPORT_WEBHOOK") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization")!;
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const { type, priority, message } = await req.json();

    // Save to database
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    await admin.from("support_tickets").insert({
      agent_id: user.id,
      type: type || "General",
      priority: priority || "Whenever",
      message: message || "",
      emailed: true,
    });

    // Post to Discord
    const profile = await admin.from("agent_profiles").select("display_name").eq("agent_id", user.id).maybeSingle();
    const agentName = profile?.data?.display_name || user.phone || "Unknown";

    await fetch(DISCORD_SUPPORT_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [{
          title: `Support: ${type}`,
          description: message,
          color: priority === "Urgent — ads down" ? 0xff0000 : 0x1976d2,
          fields: [
            { name: "Agent", value: agentName, inline: true },
            { name: "Priority", value: priority, inline: true },
          ],
          timestamp: new Date().toISOString(),
        }],
      }),
    });

    return new Response(JSON.stringify({ emailed: true }), { headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});

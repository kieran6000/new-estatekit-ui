import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const { pageId } = await req.json();
    if (!pageId) return new Response(JSON.stringify({ error: "pageId required" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });

    const { data: tokenRow } = await supabase.rpc("get_secret", { secret_name: "FB_ACCESS_TOKEN" });
    const token = tokenRow || Deno.env.get("FB_ACCESS_TOKEN") || "";
    if (!token) return new Response(JSON.stringify({ error: "No FB token configured" }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });

    const res = await fetch(
      `https://graph.facebook.com/v21.0/${pageId}/leadgen_forms?fields=id,name,status&access_token=${token}`,
    );
    if (!res.ok) {
      const text = await res.text();
      return new Response(JSON.stringify({ error: `FB API error: ${text}` }), { status: 502, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    const data = await res.json();
    const forms = (data.data || []).map((f: { id: string; name: string; status: string }) => ({
      id: f.id,
      name: f.name,
      status: f.status,
    }));

    return new Response(JSON.stringify({ forms }), { headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});

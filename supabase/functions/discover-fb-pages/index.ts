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

const TOKEN_NAMES = ["FB_ACCESS_TOKEN", "FB_ACCESS_TOKEN_2"];

async function getToken(name: string): Promise<string> {
  const { data } = await supabase.rpc("get_secret", { secret_name: name });
  return data || "";
}

interface FBPage { id: string; name: string }
interface FBAdAccount { id: string; name: string }

async function fetchPages(token: string): Promise<FBPage[]> {
  const res = await fetch(
    `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token&access_token=${token}`,
  );
  if (!res.ok) return [];
  const data = await res.json();
  return (data.data || []).map((p: { id: string; name: string }) => ({ id: p.id, name: p.name }));
}

async function fetchAdAccounts(token: string): Promise<FBAdAccount[]> {
  const res = await fetch(
    `https://graph.facebook.com/v21.0/me/adaccounts?fields=account_id,name&access_token=${token}`,
  );
  if (!res.ok) return [];
  const data = await res.json();
  return (data.data || []).map((a: { id: string; account_id: string; name: string }) => ({ id: a.id, name: a.name }));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    let tokenNames = TOKEN_NAMES;
    try {
      const body = await req.json();
      if (body?.token_name) tokenNames = [body.token_name];
    } catch { /* no body is fine */ }

    const allPages: FBPage[] = [];
    const allAdAccounts: FBAdAccount[] = [];
    const seenPageIds = new Set<string>();
    const seenAdIds = new Set<string>();

    for (const name of tokenNames) {
      const token = await getToken(name);
      if (!token) continue;

      const pages = await fetchPages(token);
      for (const p of pages) {
        if (!seenPageIds.has(p.id)) {
          seenPageIds.add(p.id);
          allPages.push(p);
        }
      }

      const adAccounts = await fetchAdAccounts(token);
      for (const a of adAccounts) {
        if (!seenAdIds.has(a.id)) {
          seenAdIds.add(a.id);
          allAdAccounts.push(a);
        }
      }
    }

    return new Response(
      JSON.stringify({ pages: allPages, adAccounts: allAdAccounts }),
      { headers: { ...CORS, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }
});

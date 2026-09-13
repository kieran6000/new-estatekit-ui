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
// Every token in the vault. Pages are split across business managers, so a
// page one token can't reach is often reachable through another.
const TOKEN_NAMES = ["FB_ACCESS_TOKEN", "FB_ACCESS_TOKEN_2", "FB_ACCESS_TOKEN_ALDREDT"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

interface FbForm { id: string; name: string; status: string }

async function fetchForms(pageId: string, token: string): Promise<FbForm[]> {
  const res = await fetch(
    `${GRAPH}/${pageId}/leadgen_forms?fields=id,name,status&limit=200&access_token=${token}`,
  );
  const data = await res.json();
  if (!res.ok || data.error) {
    throw data.error || { message: `HTTP ${res.status}` };
  }
  return (data.data || []).map((f: FbForm) => ({ id: f.id, name: f.name, status: f.status }));
}

// leadgen_forms needs a PAGE access token. Pages shared through Business
// Settings often don't appear in me/accounts, but the user token can still
// read the page's own access_token field — so ask the page directly first.
async function getPageToken(pageId: string, userToken: string): Promise<string | null> {
  try {
    const res = await fetch(`${GRAPH}/${pageId}?fields=access_token&access_token=${userToken}`);
    const data = await res.json();
    if (res.ok && !data.error && data.access_token) return data.access_token as string;
  } catch { /* fall through to me/accounts */ }

  let url: string | null =
    `${GRAPH}/me/accounts?fields=id,access_token&limit=200&access_token=${userToken}`;
  while (url) {
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok || data.error) return null;
    const match = (data.data || []).find((p: { id: string }) => p.id === pageId);
    if (match?.access_token) return match.access_token as string;
    url = data.paging?.next ?? null;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const { pageId } = await req.json();
    if (!pageId) return json({ error: "pageId required" }, 400);

    const tokens: { name: string; value: string }[] = [];
    for (const name of TOKEN_NAMES) {
      const { data } = await supabase.rpc("get_secret", { secret_name: name });
      if (data) tokens.push({ name, value: data });
    }
    if (tokens.length === 0) {
      console.error("list-fb-forms: no Facebook tokens in the vault");
      return json({ forms: [], noAccess: true });
    }

    const attempts: string[] = [];

    for (const { name, value: token } of tokens) {
      const pageToken = await getPageToken(pageId, token);
      if (pageToken) {
        try {
          return json({ forms: await fetchForms(pageId, pageToken) });
        } catch (e) {
          attempts.push(`${name} page-token: ${(e as { message?: string })?.message || String(e)}`);
        }
      } else {
        attempts.push(`${name}: no page token`);
      }

      try {
        return json({ forms: await fetchForms(pageId, token) });
      } catch (e) {
        attempts.push(`${name} direct: ${(e as { message?: string })?.message || String(e)}`);
      }
    }

    // None of our tokens can read this page. Details go to the logs only —
    // the app shows a plain "no access" message.
    console.warn(`list-fb-forms: no access to page ${pageId}:`, attempts.join(" | "));
    return json({ forms: [], noAccess: true });
  } catch (err) {
    console.error("list-fb-forms failed:", err);
    return json({ error: "failed" }, 500);
  }
});

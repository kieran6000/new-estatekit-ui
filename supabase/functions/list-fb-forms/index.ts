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

// Get the page-specific access token for `pageId` from a user token's me/accounts.
async function getPageToken(pageId: string, userToken: string): Promise<string | null> {
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

    const tokens: string[] = [];
    for (const name of TOKEN_NAMES) {
      const { data } = await supabase.rpc("get_secret", { secret_name: name });
      if (data) tokens.push(data);
    }
    if (tokens.length === 0) return json({ error: "No FB token configured" }, 500);

    const attempts: string[] = [];

    for (const token of tokens) {
      // 1) Try the token directly (works if it's already a page token or a
      //    user token with pages_read_engagement on that page).
      try {
        return json({ forms: await fetchForms(pageId, token) });
      } catch (e) {
        attempts.push(`direct: ${(e as { message?: string })?.message || String(e)}`);
      }

      // 2) Exchange the user token for the page-specific token, then retry.
      //    leadgen_forms almost always requires the PAGE access token.
      const pageToken = await getPageToken(pageId, token);
      if (pageToken) {
        try {
          return json({ forms: await fetchForms(pageId, pageToken) });
        } catch (e) {
          attempts.push(`page-token: ${(e as { message?: string })?.message || String(e)}`);
        }
      } else {
        attempts.push("page-token: page not found in this token's me/accounts");
      }
    }

    // Nothing worked — surface the real FB errors so we can diagnose.
    return json(
      { error: `Could not load forms for page ${pageId}. ${attempts.join(" | ")}` },
      502,
    );
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

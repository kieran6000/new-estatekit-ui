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

// Facebook's throttling codes (app, user, page, custom). When we hit one, every
// further call only digs the hole deeper — stop immediately.
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613]);
class RateLimited extends Error {}

const BACKOFF_MINUTES = 20;

/** Facebook throttles per APP, so one client's burst blocks everyone. While a
 *  backoff is active no function calls Graph at all — every call made while
 *  throttled spends quota that is already gone, which is how a short throttle
 *  became a permanent one. */
async function backoffActive(): Promise<boolean> {
  const { data } = await supabase.from("fb_api_state").select("backoff_until").eq("id", true).maybeSingle();
  return !!data?.backoff_until && new Date(data.backoff_until) > new Date();
}

async function startBackoff(reason: string): Promise<void> {
  await supabase.from("fb_api_state").update({
    backoff_until: new Date(Date.now() + BACKOFF_MINUTES * 60_000).toISOString(),
    last_error: reason.slice(0, 500),
    updated_at: new Date().toISOString(),
  }).eq("id", true);
}

/** Page tokens do not change, so they are cached in the database. Resolving
 *  them from Graph every request (via me/accounts, our most expensive call)
 *  was the bulk of the quota being spent. */
async function cachedPageToken(pageId: string): Promise<string | null> {
  const { data } = await supabase
    .from("fb_page_tokens").select("access_token").eq("page_id", pageId).maybeSingle();
  return (data?.access_token as string) ?? null;
}

async function cachePageToken(pageId: string, token: string): Promise<void> {
  await supabase.from("fb_page_tokens").upsert(
    { page_id: pageId, access_token: token, updated_at: new Date().toISOString() },
    { onConflict: "page_id" },
  );
}


function throwIfRateLimited(data: { error?: { code?: number; message?: string } }) {
  if (data?.error?.code && RATE_LIMIT_CODES.has(data.error.code)) throw new RateLimited(data.error.message);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

interface FbForm { id: string; name: string; status: string }

function messageOf(e: unknown): string {
  return (e as { message?: string })?.message || String(e);
}

async function fetchForms(pageId: string, token: string): Promise<FbForm[]> {
  const res = await fetch(
    `${GRAPH}/${pageId}/leadgen_forms?fields=id,name,status&limit=200&access_token=${token}`,
  );
  const data = await res.json();
  throwIfRateLimited(data);
  if (!res.ok || data.error) {
    throw data.error || { message: `HTTP ${res.status}` };
  }
  return (data.data || []).map((f: FbForm) => ({ id: f.id, name: f.name, status: f.status }));
}

// leadgen_forms needs a PAGE access token. Pages shared through Business
// Settings often don't appear in me/accounts, but the user token can still
// read the page's own access_token field — so ask the page directly first.
async function getPageToken(pageId: string, userToken: string): Promise<string | null> {
  const cached = await cachedPageToken(pageId);
  if (cached) return cached;
  try {
    const res = await fetch(`${GRAPH}/${pageId}?fields=access_token&access_token=${userToken}`);
    const data = await res.json();
    throwIfRateLimited(data);
    if (res.ok && !data.error && data.access_token) {
      await cachePageToken(pageId, data.access_token);
      return data.access_token as string;
    }
  } catch (e) {
    if (e instanceof RateLimited) throw e;
  }

  let url: string | null =
    `${GRAPH}/me/accounts?fields=id,access_token&limit=200&access_token=${userToken}`;
  while (url) {
    const res = await fetch(url);
    const data = await res.json();
    throwIfRateLimited(data);
    if (!res.ok || data.error) return null;
    const match = (data.data || []).find((p: { id: string }) => p.id === pageId);
    if (match?.access_token) {
      await cachePageToken(pageId, match.access_token);
      return match.access_token as string;
    }
    url = data.paging?.next ?? null;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  let pageId = "";
  try {
    ({ pageId } = await req.json());
    if (!pageId) return json({ error: "pageId required" }, 400);

    const tokens: { name: string; value: string }[] = [];
    if (await backoffActive()) return json({ error: "rate_limited" }, 503);

    for (const name of TOKEN_NAMES) {
      const { data } = await supabase.rpc("get_secret", { secret_name: name });
      if (data) tokens.push({ name, value: data });
    }
    if (tokens.length === 0) {
      console.error("list-fb-forms: no Facebook tokens in the vault");
      return json({ forms: [], noAccess: true });
    }

    const attempts: string[] = [];

    // Page tokens first — leadgen_forms needs one — stopping at the first that works.
    for (const { name, value } of tokens) {
      const pageToken = await getPageToken(pageId, value);
      if (!pageToken) {
        attempts.push(`${name}: no page token`);
        continue;
      }
      try {
        return json({ forms: await fetchForms(pageId, pageToken) });
      } catch (e) {
        if (e instanceof RateLimited) throw e;
        attempts.push(`${name} page-token: ${messageOf(e)}`);
      }
    }

    // Raw tokens only as a last resort.
    for (const { name, value } of tokens) {
      try {
        return json({ forms: await fetchForms(pageId, value) });
      } catch (e) {
        if (e instanceof RateLimited) throw e;
        attempts.push(`${name} direct: ${messageOf(e)}`);
      }
    }

    // None of our tokens can read this page. Details go to the logs only —
    // the app shows a plain "no access" message.
    console.warn(`list-fb-forms: no access to page ${pageId}:`, attempts.join(" | "));
    return json({ forms: [], noAccess: true });
  } catch (err) {
    if (err instanceof RateLimited) {
      console.warn(`list-fb-forms: Facebook rate limit hit (page ${pageId}):`, err.message);
      await startBackoff(err.message);
      return json({ error: "rate_limited" }, 503);
    }
    console.error("list-fb-forms failed:", err);
    return json({ error: "failed" }, 500);
  }
});

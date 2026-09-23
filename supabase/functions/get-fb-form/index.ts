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
// Every token in the vault — same set as list-fb-forms, so a form that shows
// in the list can also be previewed.
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

const FORM_CACHE_HOURS = 24;

function isFresh(fetchedAt: string): boolean {
  return Date.now() - Date.parse(fetchedAt) < FORM_CACHE_HOURS * 3600 * 1000;
}

async function readFormCache(formId: string): Promise<{ payload: unknown; fetched_at: string } | null> {
  const { data } = await supabase
    .from("fb_form_cache").select("payload, fetched_at").eq("form_id", formId).maybeSingle();
  return data ?? null;
}

async function writeFormCache(formId: string, pageId: string | null, payload: unknown): Promise<void> {
  await supabase.from("fb_form_cache").upsert(
    { form_id: formId, page_id: pageId, payload, fetched_at: new Date().toISOString() },
    { onConflict: "form_id" },
  );
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

// Everything the Ads Manager preview renders for an instant form.
const FIELDS = [
  "id",
  "name",
  "status",
  "locale",
  "questions{key,label,type,options}",
  "context_card{title,content,style,button_text,cover_photo}",
  "thank_you_page{title,body,button_text,button_type,website_url,business_phone_number}",
  "legal_content",
].join(",");

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// Same lookup as list-fb-forms: ask the page for its token first (works for
// pages shared through Business Settings), then fall back to me/accounts.
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

async function fetchForm(formId: string, token: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${GRAPH}/${formId}?fields=${FIELDS}&access_token=${token}`);
  const data = await res.json();
  throwIfRateLimited(data);
  if (!res.ok || data.error) throw data.error || { message: `HTTP ${res.status}` };
  return data;
}

async function fetchPage(pageId: string, token: string): Promise<{ name?: string; picture?: string } | null> {
  try {
    const res = await fetch(`${GRAPH}/${pageId}?fields=name,picture.width(160).height(160){url}&access_token=${token}`);
    const data = await res.json();
    if (!res.ok || data.error) return null;
    return { name: data.name, picture: data.picture?.data?.url };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  let formId = "";
  try {
    const body = await req.json();
    const pageId: string | null = body.pageId ?? null;
    formId = body.formId;
    if (!formId) return json({ error: "formId required" }, 400);

    // A published form's questions effectively never change, so Facebook only
    // needs asking once. Serving the cache first is what makes this page work
    // during a throttle instead of showing "Facebook is busy" for 20 minutes.
    const cached = await readFormCache(formId);
    // Operator escape hatch: ignore our own backoff for one deliberate call.
    // Used to warm the cache as soon as Facebook recovers, instead of waiting
    // out a timer that only exists to protect the quota. One call is cheap; if
    // Facebook is still throttling, the backoff simply re-arms.
    const force = body.force === true;
    const throttled = !force && (await backoffActive());
    if (cached && (isFresh(cached.fetched_at) || throttled)) {
      return json({ ...(cached.payload as Record<string, unknown>), cached: true });
    }
    // Nothing cached and Facebook is off-limits — only now is it a real failure.
    if (throttled) return json({ error: "rate_limited" }, 503);

    const tokens: string[] = [];
    for (const name of TOKEN_NAMES) {
      const { data } = await supabase.rpc("get_secret", { secret_name: name });
      if (data) tokens.push(data);
    }
    if (tokens.length === 0) {
      console.error("get-fb-form: no Facebook tokens in the vault");
      return json({ form: null, page: null, noAccess: true });
    }

    const attempts: string[] = [];
    for (const token of tokens) {
      // Form nodes need the page token; try the page token first when we can
      // resolve it, then fall back to the raw token.
      const candidates: string[] = [];
      if (pageId) {
        const pt = await getPageToken(pageId, token);
        if (pt) candidates.push(pt);
      }
      candidates.push(token);

      for (const t of candidates) {
        try {
          const form = await fetchForm(formId, t);
          const page = pageId ? await fetchPage(pageId, t) : null;
          // Cached so the next visit — and any visit during a throttle —
          // costs Facebook nothing.
          await writeFormCache(formId, pageId, { form, page });
          return json({ form, page });
        } catch (e) {
          if (e instanceof RateLimited) throw e;
          attempts.push((e as { message?: string })?.message || String(e));
        }
      }
    }

    // Details go to the logs only — the app shows a plain "no access" message.
    console.warn(`get-fb-form: no access to form ${formId}:`, attempts.join(" | "));
    if (cached) return json({ ...(cached.payload as Record<string, unknown>), cached: true, stale: true });
    return json({ form: null, page: null, noAccess: true });
  } catch (err) {
    if (err instanceof RateLimited) {
      console.warn(`get-fb-form: Facebook rate limit hit (form ${formId}):`, err.message);
      await startBackoff(err.message);
      return json({ error: "rate_limited" }, 503);
    }
    console.error("get-fb-form failed:", err);
    return json({ error: "failed" }, 500);
  }
});

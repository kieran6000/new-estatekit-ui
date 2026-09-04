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

async function fetchForm(formId: string, token: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${GRAPH}/${formId}?fields=${FIELDS}&access_token=${token}`);
  const data = await res.json();
  if (!res.ok || data.error) throw data.error || { message: `HTTP ${res.status}` };
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const { pageId, formId } = await req.json();
    if (!formId) return json({ error: "formId required" }, 400);

    const tokens: string[] = [];
    for (const name of TOKEN_NAMES) {
      const { data } = await supabase.rpc("get_secret", { secret_name: name });
      if (data) tokens.push(data);
    }
    if (tokens.length === 0) return json({ error: "No FB token configured" }, 500);

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
          return json({ form: await fetchForm(formId, t) });
        } catch (e) {
          attempts.push((e as { message?: string })?.message || String(e));
        }
      }
    }

    return json({ error: `Could not load form ${formId}. ${attempts.join(" | ")}` }, 502);
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

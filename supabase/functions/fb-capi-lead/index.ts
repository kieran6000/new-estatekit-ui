import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

// Reports a landing-page lead to Meta's Conversions API, server-side.
//
// Why bother when the browser pixel already fires: ad blockers, iOS tracking
// prevention and third-party cookie restrictions lose a meaningful share of
// browser events. The server sees every submission. Both are sent with the same
// event_id so Meta deduplicates them into one conversion rather than counting
// two.
//
// Weak leads are NOT reported. Reporting them teaches the pixel to find more of
// the same, which is the opposite of what the agent wants — see the quality
// grading in the form builder.

const GRAPH = "https://graph.facebook.com/v21.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

/** Meta requires customer data hashed with SHA-256, lowercased and trimmed. */
async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value.trim().toLowerCase());
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Phone numbers hash in E.164 *without* the leading +, digits only. A local
 *  SA number ("082…") is converted to 27… first, or Meta simply won't match it. */
async function hashPhone(raw: string): Promise<string | null> {
  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("0")) digits = `27${digits.slice(1)}`;
  if (digits.length < 9) return null;
  return await sha256(digits);
}

/** Meta's click id, rebuilt from fbclid. Format: fb.1.<timestamp_ms>.<fbclid> */
function buildFbc(fbclid: string | undefined, createdAtMs: number): string | undefined {
  if (!fbclid) return undefined;
  return `fb.1.${createdAtMs}.${fbclid}`;
}

interface CapiConfig {
  pixel_id: string;
  access_token: string;
  enabled: boolean;
  test_event_code: string | null;
}

async function loadConfig(supabase: SupabaseClient, pixelId: string): Promise<CapiConfig | null> {
  const { data } = await supabase
    .from("fb_capi_config")
    .select("pixel_id, access_token, enabled, test_event_code")
    .eq("pixel_id", pixelId)
    .maybeSingle();
  if (!data?.enabled) return null;
  return data as CapiConfig;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let body: {
    leadId?: string;
    pixelId?: string;
    eventId?: string;
    eventName?: string;
    sourceUrl?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  if (!body.leadId || !body.pixelId) return json({ error: "leadId and pixelId required" }, 400);

  const config = await loadConfig(supabase, body.pixelId);
  // Not configured, or switched off — a no-op, not an error. The landing page
  // shouldn't care whether CAPI happens to be set up for this pixel.
  if (!config) return json({ skipped: "no enabled CAPI config for this pixel" });

  const { data: lead } = await supabase
    .from("leads")
    .select("id, name, phone, email, quality, attribution, created_at")
    .eq("id", body.leadId)
    .maybeSingle();
  if (!lead) return json({ error: "lead not found" }, 404);

  // The whole point of the quality grading: don't teach the pixel to find more
  // of a lead the agent has told us is poor.
  if (lead.quality === "weak") {
    return json({ skipped: "lead graded weak — not reported as a conversion" });
  }

  const eventId = body.eventId || `lead_${lead.id}`;

  // Already reported (a retry, or the page fired twice) — stop before sending.
  const { data: existing } = await supabase
    .from("fb_capi_events")
    .select("id")
    .eq("event_id", eventId)
    .maybeSingle();
  if (existing) return json({ skipped: "already reported" });

  const attribution = (lead.attribution ?? {}) as Record<string, string>;
  const createdAtMs = Date.parse(lead.created_at) || Date.now();

  const [emailHash, phoneHash, firstNameHash, lastNameHash] = await Promise.all([
    lead.email ? sha256(lead.email) : Promise.resolve(null),
    hashPhone(lead.phone ?? ""),
    lead.name ? sha256(lead.name.split(" ")[0]) : Promise.resolve(null),
    lead.name && lead.name.split(" ").length > 1
      ? sha256(lead.name.split(" ").slice(1).join(" "))
      : Promise.resolve(null),
  ]);

  const userData: Record<string, unknown> = {};
  if (emailHash) userData.em = [emailHash];
  if (phoneHash) userData.ph = [phoneHash];
  if (firstNameHash) userData.fn = [firstNameHash];
  if (lastNameHash) userData.ln = [lastNameHash];
  if (attribution.fbp) userData.fbp = attribution.fbp;
  const fbc = attribution.fbc || buildFbc(attribution.fbclid, createdAtMs);
  if (fbc) userData.fbc = fbc;
  userData.country = [await sha256("za")];

  const payload = {
    data: [{
      event_name: body.eventName || "Lead",
      event_time: Math.floor(createdAtMs / 1000),
      event_id: eventId,
      action_source: "website",
      event_source_url: body.sourceUrl || undefined,
      user_data: userData,
      custom_data: {
        lead_quality: lead.quality,
        ...(attribution.campaign_name ? { campaign_name: attribution.campaign_name } : {}),
      },
    }],
    ...(config.test_event_code ? { test_event_code: config.test_event_code } : {}),
  };

  let status = "sent";
  let responseText = "";
  try {
    const res = await fetch(`${GRAPH}/${config.pixel_id}/events?access_token=${config.access_token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    responseText = (await res.text()).slice(0, 1000);
    if (!res.ok) {
      status = "failed";
      console.error("CAPI send failed", res.status, responseText);
    }
  } catch (err) {
    status = "failed";
    responseText = String(err).slice(0, 1000);
    console.error("CAPI send threw", err);
  }

  await supabase.from("fb_capi_events").insert({
    lead_id: lead.id,
    pixel_id: config.pixel_id,
    event_id: eventId,
    event_name: body.eventName || "Lead",
    status,
    response: responseText,
  });

  return json({ status, eventId, test: !!config.test_event_code });
});

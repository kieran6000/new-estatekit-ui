import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const PIPELINE_STAGES: Record<string, string[]> = {
  seller: ["New Lead", "No Answer", "Contacted", "Booked", "Mandate Signed", "Lost", "Invalid Number"],
  buyer: ["New Lead", "No Answer", "Contacted", "Viewing Booked", "Offer Made", "Bought", "Lost", "Invalid Number"],
};

const HEADERS = ["Name", "Phone", "Email", "Stage", "Next Step", "Note", "Created"];

async function getAccessToken(serviceAccountKey: string): Promise<string> {
  const sa = JSON.parse(serviceAccountKey);
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const claims = btoa(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  }));
  const signInput = `${header}.${claims}`;

  const pemContent = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\n/g, "");
  const binaryKey = Uint8Array.from(atob(pemContent), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(signInput));
  const signature = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const headerB64 = header.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const claimsB64 = claims.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const jwt = `${headerB64}.${claimsB64}.${signature}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error(`Google auth failed: ${JSON.stringify(tokenData)}`);
  return tokenData.access_token;
}

async function createSheet(accessToken: string, title: string, stages: string[]): Promise<{ spreadsheetId: string }> {
  const res = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      properties: { title },
      sheets: [{
        properties: { title: "Leads", sheetId: 0 },
        data: [{
          startRow: 0,
          startColumn: 0,
          rowData: [{ values: HEADERS.map((h) => ({ userEnteredValue: { stringValue: h }, userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.9, green: 0.93, blue: 0.96 } } })) }],
        }],
      }],
    }),
  });
  const data = await res.json();
  if (!data.spreadsheetId) throw new Error(`Sheet creation failed: ${JSON.stringify(data)}`);

  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${data.spreadsheetId}:batchUpdate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [
        {
          setDataValidation: {
            range: { sheetId: 0, startRowIndex: 1, startColumnIndex: 3, endColumnIndex: 4 },
            rule: {
              condition: { type: "ONE_OF_LIST", values: stages.map((s) => ({ userEnteredValue: s })) },
              showCustomUi: true,
              strict: false,
            },
          },
        },
        {
          autoResizeDimensions: {
            dimensions: { sheetId: 0, dimension: "COLUMNS", startIndex: 0, endIndex: HEADERS.length },
          },
        },
      ],
    }),
  });

  return { spreadsheetId: data.spreadsheetId };
}

async function syncLeadsToSheet(accessToken: string, spreadsheetId: string, leads: any[]) {
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Leads!A2:G?valueInputOption=RAW`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        range: "Leads!A2:G",
        majorDimension: "ROWS",
        values: leads.map((l) => [
          l.name,
          l.phone,
          l.email || "",
          l.stage,
          l.next_label,
          l.note || "",
          new Date(l.created_at).toLocaleDateString("en-GB"),
        ]),
      }),
    },
  );
}

async function shareSheet(accessToken: string, spreadsheetId: string) {
  await fetch(`https://www.googleapis.com/drive/v3/files/${spreadsheetId}/permissions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ role: "writer", type: "anyone" }),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" } });
  }

  try {
    const authHeader = req.headers.get("Authorization")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Service-account JSON: env var first, else the vault secret (so it can be
    // configured without dashboard access).
    let GOOGLE_SERVICE_ACCOUNT_KEY = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");
    if (!GOOGLE_SERVICE_ACCOUNT_KEY) {
      const { data } = await supabase.rpc("get_secret", { secret_name: "GOOGLE_SERVICE_ACCOUNT_KEY" });
      GOOGLE_SERVICE_ACCOUNT_KEY = data || undefined;
    }
    if (!GOOGLE_SERVICE_ACCOUNT_KEY) {
      return new Response(JSON.stringify({ error: "Google Sheets not configured — service account key missing." }), { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
    }
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });

    const { pipeline_id } = await req.json();
    if (!pipeline_id) return new Response(JSON.stringify({ error: "pipeline_id required" }), { status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });

    const { data: pipeline } = await supabase
      .from("pipelines")
      .select("id, name, kind, sheet_url, agent_id")
      .eq("id", pipeline_id)
      .single();
    if (!pipeline) return new Response(JSON.stringify({ error: "Pipeline not found" }), { status: 404, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });

    const { data: profile } = await supabase
      .from("agent_profiles")
      .select("display_name")
      .eq("agent_id", pipeline.agent_id)
      .maybeSingle();

    const accessToken = await getAccessToken(GOOGLE_SERVICE_ACCOUNT_KEY);
    const stages = PIPELINE_STAGES[pipeline.kind] || PIPELINE_STAGES.seller;

    let spreadsheetId = "";
    let sheetUrl = pipeline.sheet_url;

    if (!sheetUrl) {
      const agentLabel = profile?.display_name || "Agent";
      const title = `${agentLabel} — ${pipeline.name} Pipeline`;
      const result = await createSheet(accessToken, title, stages);
      spreadsheetId = result.spreadsheetId;
      sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;

      await shareSheet(accessToken, spreadsheetId);

      await supabase
        .from("pipelines")
        .update({ sheet_url: sheetUrl })
        .eq("id", pipeline_id);
    } else {
      const match = sheetUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
      if (!match) return new Response(JSON.stringify({ error: "Invalid sheet URL" }), { status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
      spreadsheetId = match[1];
    }

    const { data: leads } = await supabase
      .from("leads")
      .select("name, phone, email, stage, next_label, note, created_at")
      .eq("pipeline_id", pipeline_id)
      .order("created_at", { ascending: false });

    await syncLeadsToSheet(accessToken, spreadsheetId, leads || []);

    return new Response(JSON.stringify({ sheet_url: sheetUrl }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
});

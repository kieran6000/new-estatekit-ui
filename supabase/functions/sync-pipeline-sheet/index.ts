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

/**
 * Access token for EstateKit's own Google account (a free Gmail account works).
 * A service account can't own files on a free account ("storage quota
 * exceeded"), so this is the preferred way: one refresh token, made once in
 * the OAuth Playground with the drive.file scope (see the setup guide).
 */
async function getOAuthToken(clientId: string, clientSecret: string, refreshToken: string): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Google auth failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

/** The "EstateKit Client Sheets" folder this app made, creating it the first
 *  time. With the drive.file scope the app only sees folders it made itself. */
async function getOrCreateFolder(accessToken: string): Promise<string> {
  const name = "EstateKit Client Sheets";
  const q = encodeURIComponent(`name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
  const found = await (await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`, { headers: { Authorization: `Bearer ${accessToken}` } })).json();
  if (found.files?.[0]?.id) return found.files[0].id;
  const made = await (await fetch("https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder" }),
  })).json();
  if (!made.id) throw new Error(`Folder creation failed: ${JSON.stringify(made)}`);
  return made.id;
}

async function createSheet(accessToken: string, title: string, stages: string[], folderId: string | null): Promise<{ spreadsheetId: string }> {
  // Created through Drive so it can go straight into a folder (a shared drive
  // for a service account, or our own folder for the OAuth account).
  const fileRes = await fetch("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: title, mimeType: "application/vnd.google-apps.spreadsheet", ...(folderId ? { parents: [folderId] } : {}) }),
  });
  const file = await fileRes.json();
  if (!file.id) throw new Error(`Sheet creation failed: ${JSON.stringify(file)}`);
  const data = { spreadsheetId: file.id as string };

  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${data.spreadsheetId}/values/A1:G1?valueInputOption=RAW`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ values: [HEADERS] }),
  });

  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${data.spreadsheetId}:batchUpdate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [
        { updateSheetProperties: { properties: { sheetId: 0, title: "Leads", gridProperties: { frozenRowCount: 1 } }, fields: "title,gridProperties.frozenRowCount" } },
        {
          repeatCell: {
            range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1 },
            cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.9, green: 0.93, blue: 0.96 } } },
            fields: "userEnteredFormat(textFormat,backgroundColor)",
          },
        },
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

/** Same wording as the app's Next column: an untouched new lead says how
 *  long it has waited, instead of "Just came in" forever. */
function nextStep(l: { stage: string; next_label: string; created_at: string }): string {
  const untouched = l.stage === "New Lead" && (!l.next_label || l.next_label === "Just came in" || l.next_label === "—");
  if (!untouched) return l.next_label;
  const mins = Math.max(0, Math.floor((Date.now() - new Date(l.created_at).getTime()) / 60000));
  if (mins < 60) return "Call now";
  if (mins < 1440) return `Call today · waiting ${Math.floor(mins / 60)}h`;
  const days = Math.floor(mins / 1440);
  return days < 14 ? `Not called · ${days} day${days === 1 ? "" : "s"}` : `Not called · ${Math.floor(days / 7)} wks`;
}

async function syncLeadsToSheet(accessToken: string, spreadsheetId: string, leads: any[]) {
  // Clear first, so leads that were deleted don't linger at the bottom.
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Leads!A2:G:clear`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
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
          nextStep(l),
          l.note || "",
          new Date(l.created_at).toLocaleDateString("en-GB"),
        ]),
      }),
    },
  );
}

/** Gives the agent edit access by email. Never "anyone with the link": the
 *  sheet holds the client's leads (names, phone numbers), so a forwarded link
 *  must not open it. */
async function shareSheet(accessToken: string, spreadsheetId: string, email: string) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${spreadsheetId}/permissions?supportsAllDrives=true&sendNotificationEmail=true`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ role: "writer", type: "user", emailAddress: email }),
  });
  if (!res.ok) console.error("share failed", spreadsheetId, await res.text());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" } });
  }

  try {
    const authHeader = req.headers.get("Authorization")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Each secret: the function's env first, else the vault (so it can be
    // configured without dashboard access).
    const secret = async (name: string): Promise<string | undefined> => {
      const v = Deno.env.get(name);
      if (v) return v;
      const { data } = await supabase.rpc("get_secret", { secret_name: name });
      return data || undefined;
    };
    // Preferred: EstateKit's own Google account (works on free Gmail).
    // Fallback: a service account writing into a Workspace shared drive.
    const oauthId = await secret("GOOGLE_OAUTH_CLIENT_ID");
    const oauthSecret = await secret("GOOGLE_OAUTH_CLIENT_SECRET");
    const oauthRefresh = await secret("GOOGLE_OAUTH_REFRESH_TOKEN");
    const useOAuth = !!(oauthId && oauthSecret && oauthRefresh);
    const GOOGLE_SERVICE_ACCOUNT_KEY = useOAuth ? undefined : await secret("GOOGLE_SERVICE_ACCOUNT_KEY");
    if (!useOAuth && !GOOGLE_SERVICE_ACCOUNT_KEY) {
      return new Response(JSON.stringify({ error: "Google Sheets not configured: no Google account connected (service account key missing)." }), { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
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

    // Only the agent themselves or an operator may export a pipeline.
    if (pipeline.agent_id !== user.id) {
      const { data: me } = await supabase.from("agent_profiles").select("is_operator").eq("agent_id", user.id).maybeSingle();
      if (!me?.is_operator) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
    }

    const { data: profile } = await supabase
      .from("agent_profiles")
      .select("display_name, email")
      .eq("agent_id", pipeline.agent_id)
      .maybeSingle();

    const accessToken = useOAuth
      ? await getOAuthToken(oauthId!, oauthSecret!, oauthRefresh!)
      : await getAccessToken(GOOGLE_SERVICE_ACCOUNT_KEY!);
    const stages = PIPELINE_STAGES[pipeline.kind] || PIPELINE_STAGES.seller;

    let spreadsheetId = "";
    let sheetUrl = pipeline.sheet_url;

    if (!sheetUrl) {
      const agentLabel = profile?.display_name || "Agent";
      const title = `${agentLabel} — ${pipeline.name} Pipeline`;
      const folderId = useOAuth ? await getOrCreateFolder(accessToken) : (await secret("GOOGLE_SHEETS_FOLDER_ID")) ?? null;
      const result = await createSheet(accessToken, title, stages, folderId);
      spreadsheetId = result.spreadsheetId;
      sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;

      if (profile?.email) await shareSheet(accessToken, spreadsheetId, profile.email);

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

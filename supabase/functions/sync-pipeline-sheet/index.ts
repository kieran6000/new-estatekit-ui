import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const PIPELINE_STAGES: Record<string, string[]> = {
  seller: ["New Lead", "No Answer", "Contacted", "Booked", "Mandate Signed", "Lost", "Invalid Number"],
  buyer: ["New Lead", "No Answer", "Contacted", "Viewing Booked", "Offer Made", "Bought", "Lost", "Invalid Number"],
};

// The Leads tab, left to right. Row 1 is the EstateKit banner, row 2 the
// "last updated" line, row 3 these headers, leads from row 4.
const HEADERS = ["First name", "Surname", "Phone", "Email", "Stage", "Next step", "Came in", "Source", "Notes", "In EstateKit"];
const NCOLS = HEADERS.length;
const FIRST_DATA_ROW = 3; // 0-based: row 4 in the sheet
const WIDTHS = [130, 150, 130, 220, 130, 200, 150, 130, 300, 110];

const BRAND = { red: 0.098, green: 0.463, blue: 0.824 }; // #1976d2
const BRAND_SOFT = { red: 0.91, green: 0.94, blue: 0.996 }; // #e8f0fe
const BAND = { red: 0.973, green: 0.98, blue: 0.988 };
const WHITE = { red: 1, green: 1, blue: 1 };
const GREY = { red: 0.42, green: 0.45, blue: 0.5 };
const rgb = (hex: string) => ({ red: parseInt(hex.slice(1, 3), 16) / 255, green: parseInt(hex.slice(3, 5), 16) / 255, blue: parseInt(hex.slice(5, 7), 16) / 255 });

// Same colours as the stage chips in the app.
const STAGE_COLORS: Record<string, [string, string]> = {
  "New Lead": ["#e3f2fd", "#0d47a1"],
  "No Answer": ["#fff3e0", "#e65100"],
  "Contacted": ["#f3e5f5", "#6a1b9a"],
  "Booked": ["#e8f5e9", "#1b5e20"],
  "Viewing Booked": ["#e8f5e9", "#1b5e20"],
  "Offer Made": ["#e0f7fa", "#006064"],
  "Mandate Signed": ["#c8e6c9", "#1b5e20"],
  "Bought": ["#c8e6c9", "#1b5e20"],
  "Lost": ["#eeeeee", "#616161"],
  "Invalid Number": ["#eeeeee", "#616161"],
};

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

async function createSheet(accessToken: string, title: string, folderId: string | null): Promise<{ spreadsheetId: string }> {
  // Created through Drive so it can go straight into a folder (a shared drive
  // for a service account, or our own folder for the OAuth account). The
  // layout is drawn by renderSheet on every sync, so old sheets get it too.
  const fileRes = await fetch("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: title, mimeType: "application/vnd.google-apps.spreadsheet", ...(folderId ? { parents: [folderId] } : {}) }),
  });
  const file = await fileRes.json();
  if (!file.id) throw new Error(`Sheet creation failed: ${JSON.stringify(file)}`);
  return { spreadsheetId: file.id as string };
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

const titleCase = (v: string) => (v === v.toLowerCase() || v === v.toUpperCase() ? v.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (m) => m.toUpperCase()) : v);

/** "thandi mokoena-dlamini" → ["Thandi", "Mokoena-Dlamini"]. Everything after the first word is the surname. */
function splitName(name: string): [string, string] {
  const parts = titleCase((name || "").trim()).split(/\s+/).filter(Boolean);
  return [parts[0] ?? "", parts.slice(1).join(" ")];
}

/** 27825550199 / 0825550199 → "082 555 0199". Anything else is left as typed. */
function prettyPhone(raw: string): string {
  let d = (raw || "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("27")) d = "0" + d.slice(2);
  return d.length === 10 && d.startsWith("0") ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : raw || "";
}

/** A date as a Sheets serial number in SAST, so the column sorts and filters as real dates. */
const sastSerial = (iso: string) => (new Date(iso).getTime() + 2 * 3600_000) / 86_400_000 + 25569;

const sourceOf = (l: any) => (l.fb_lead_id ? "Facebook ad" : l.source_page_id ? "EstateKit page" : "Added by hand");

async function sheetsFetch(accessToken: string, url: string, init: RequestInit = {}) {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", ...(init.headers ?? {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Sheets ${res.status}: ${JSON.stringify(body).slice(0, 400)}`);
  return body;
}

/**
 * Draws the whole sheet: an EstateKit banner, a "last updated" line, headers,
 * one row per lead, stage colours, filters and a Summary tab. It rebuilds
 * everything each time (old sheets get the new layout on their next update).
 *
 * Lead data is written RAW so a name like "=IMPORTXML(...)" from a public form
 * is stored as text, never run as a formula. Only our own formulas (the lead
 * links and the Summary counts) are written as formulas.
 */
async function renderSheet(accessToken: string, spreadsheetId: string, o: { agentName: string; pipelineName: string; stages: string[]; leads: any[] }) {
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
  const meta = await sheetsFetch(accessToken, `${base}?fields=sheets(properties(sheetId,title,gridProperties),bandedRanges(bandedRangeId),conditionalFormats)`);
  const sheets: any[] = meta.sheets ?? [];
  const leadsTab = sheets.find((x) => x.properties.title === "Leads") ?? sheets[0];
  const sid: number = leadsTab.properties.sheetId;
  const rowCount: number = leadsTab.properties.gridProperties?.rowCount ?? 1000;
  const summary = sheets.find((x) => x.properties.title === "Summary");
  // A new file's first tab is "Sheet1": name it before writing to "Leads!".
  if (leadsTab.properties.title !== "Leads") {
    await sheetsFetch(accessToken, `${base}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests: [{ updateSheetProperties: { properties: { sheetId: sid, title: "Leads" }, fields: "title" } }] }) });
  }

  const n = o.leads.length;
  const needRows = FIRST_DATA_ROW + n + 10;
  const when = new Date(Date.now() + 2 * 3600_000).toISOString().replace("T", " ").slice(0, 16);

  // ── Values ────────────────────────────────────────────────────────────
  await sheetsFetch(accessToken, `${base}/values/Leads!A1:Z:clear`, { method: "POST" });
  if (rowCount < needRows) {
    await sheetsFetch(accessToken, `${base}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests: [{ appendDimension: { sheetId: sid, dimension: "ROWS", length: needRows - rowCount } }] }) });
  }
  const rows = o.leads.map((l) => {
    const [first, last] = splitName(l.name);
    return [first, last, prettyPhone(l.phone), (l.email || "").toLowerCase(), l.stage, nextStep(l), sastSerial(l.created_at), sourceOf(l), l.note || "", ""];
  });
  await sheetsFetch(accessToken, `${base}/values/Leads!A1?valueInputOption=RAW`, {
    method: "PUT",
    body: JSON.stringify({
      values: [
        [`EstateKit  ·  ${o.agentName}  ·  ${o.pipelineName} leads`],
        [`Updated ${when} (SAST)  ·  ${n} lead${n === 1 ? "" : "s"}  ·  This sheet is a copy: update leads in EstateKit, then tap "Update sheet". Edits made here are replaced.`],
        HEADERS,
        ...rows,
      ],
    }),
  });
  if (n) {
    await sheetsFetch(accessToken, `${base}/values/Leads!J${FIRST_DATA_ROW + 1}?valueInputOption=USER_ENTERED`, {
      method: "PUT",
      body: JSON.stringify({ values: o.leads.map((l) => [`=HYPERLINK("https://leads.estatekit.co/leads/${String(l.id).replace(/[^0-9a-f-]/gi, "")}","Open lead")`]) }),
    });
  }

  // ── Layout and formatting ─────────────────────────────────────────────
  const range = (r0: number, r1: number | undefined, c0 = 0, c1 = NCOLS) => ({ sheetId: sid, startRowIndex: r0, ...(r1 !== undefined ? { endRowIndex: r1 } : {}), startColumnIndex: c0, endColumnIndex: c1 });
  const requests: any[] = [
    { updateSpreadsheetProperties: { properties: { title: `EstateKit · ${o.agentName} · ${o.pipelineName} leads`, timeZone: "Africa/Johannesburg" }, fields: "title,timeZone" } },
    { updateSheetProperties: { properties: { sheetId: sid, title: "Leads", index: 0, gridProperties: { frozenRowCount: 3, frozenColumnCount: 0 } }, fields: "title,index,gridProperties.frozenRowCount,gridProperties.frozenColumnCount" } },
    // Start clean: old formats, the old Stage dropdown, merges, bands and colour rules.
    { repeatCell: { range: { sheetId: sid }, cell: { userEnteredFormat: {} }, fields: "userEnteredFormat" } },
    { setDataValidation: { range: { sheetId: sid } } },
    { unmergeCells: { range: range(0, 2) } },
    ...(leadsTab.bandedRanges ?? []).map((b: any) => ({ deleteBanding: { bandedRangeId: b.bandedRangeId } })),
    ...(leadsTab.conditionalFormats ?? []).map((_: any, i: number, all: any[]) => ({ deleteConditionalFormatRule: { sheetId: sid, index: all.length - 1 - i } })),

    // Row 1: the EstateKit banner. Row 2: last updated.
    { mergeCells: { range: range(0, 1), mergeType: "MERGE_ALL" } },
    { mergeCells: { range: range(1, 2), mergeType: "MERGE_ALL" } },
    { repeatCell: { range: range(0, 1), cell: { userEnteredFormat: { backgroundColor: BRAND, verticalAlignment: "MIDDLE", padding: { left: 10 }, textFormat: { bold: true, fontSize: 14, foregroundColor: WHITE } } }, fields: "userEnteredFormat(backgroundColor,verticalAlignment,padding,textFormat)" } },
    { repeatCell: { range: range(1, 2), cell: { userEnteredFormat: { backgroundColor: BRAND_SOFT, verticalAlignment: "MIDDLE", padding: { left: 10 }, textFormat: { italic: true, fontSize: 9, foregroundColor: GREY } } }, fields: "userEnteredFormat(backgroundColor,verticalAlignment,padding,textFormat)" } },
    // Row 3: headers.
    { repeatCell: { range: range(2, 3), cell: { userEnteredFormat: { verticalAlignment: "MIDDLE", textFormat: { bold: true, fontSize: 10 }, borders: { bottom: { style: "SOLID_MEDIUM", color: BRAND } } } }, fields: "userEnteredFormat(verticalAlignment,textFormat,borders)" } },
    // Leads: middle-aligned, readable date, wrapped notes, bold first name, link column centred.
    { repeatCell: { range: range(FIRST_DATA_ROW, undefined), cell: { userEnteredFormat: { verticalAlignment: "MIDDLE", wrapStrategy: "CLIP" } }, fields: "userEnteredFormat(verticalAlignment,wrapStrategy)" } },
    { repeatCell: { range: range(FIRST_DATA_ROW, undefined, 0, 1), cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: "userEnteredFormat.textFormat.bold" } },
    { repeatCell: { range: range(FIRST_DATA_ROW, undefined, 6, 7), cell: { userEnteredFormat: { numberFormat: { type: "DATE_TIME", pattern: "d mmm yyyy, hh:mm" }, horizontalAlignment: "LEFT" } }, fields: "userEnteredFormat(numberFormat,horizontalAlignment)" } },
    { repeatCell: { range: range(FIRST_DATA_ROW, undefined, 8, 9), cell: { userEnteredFormat: { wrapStrategy: "WRAP" } }, fields: "userEnteredFormat.wrapStrategy" } },
    { repeatCell: { range: range(FIRST_DATA_ROW, undefined, 4, 5), cell: { userEnteredFormat: { horizontalAlignment: "CENTER", textFormat: { bold: true } } }, fields: "userEnteredFormat(horizontalAlignment,textFormat.bold)" } },
    { repeatCell: { range: range(FIRST_DATA_ROW, undefined, 9, 10), cell: { userEnteredFormat: { horizontalAlignment: "CENTER" } }, fields: "userEnteredFormat.horizontalAlignment" } },
    // Sizes.
    { updateDimensionProperties: { range: { sheetId: sid, dimension: "ROWS", startIndex: 0, endIndex: 1 }, properties: { pixelSize: 42 }, fields: "pixelSize" } },
    { updateDimensionProperties: { range: { sheetId: sid, dimension: "ROWS", startIndex: 1, endIndex: 2 }, properties: { pixelSize: 24 }, fields: "pixelSize" } },
    { updateDimensionProperties: { range: { sheetId: sid, dimension: "ROWS", startIndex: 2, endIndex: 3 }, properties: { pixelSize: 34 }, fields: "pixelSize" } },
    { updateDimensionProperties: { range: { sheetId: sid, dimension: "ROWS", startIndex: 3, endIndex: FIRST_DATA_ROW + Math.max(n, 1) }, properties: { pixelSize: 30 }, fields: "pixelSize" } },
    ...WIDTHS.map((w, i) => ({ updateDimensionProperties: { range: { sheetId: sid, dimension: "COLUMNS", startIndex: i, endIndex: i + 1 }, properties: { pixelSize: w }, fields: "pixelSize" } })),
    // Zebra rows (the header row takes the soft brand colour).
    { addBanding: { bandedRange: { range: range(2, FIRST_DATA_ROW + Math.max(n, 1)), rowProperties: { headerColor: BRAND_SOFT, firstBandColor: WHITE, secondBandColor: BAND } } } },
    // Stage colours, like the chips in the app.
    ...o.stages.filter((st) => STAGE_COLORS[st]).map((st, i) => ({
      addConditionalFormatRule: {
        index: i,
        rule: {
          ranges: [range(FIRST_DATA_ROW, undefined, 4, 5)],
          booleanRule: { condition: { type: "TEXT_EQ", values: [{ userEnteredValue: st }] }, format: { backgroundColor: rgb(STAGE_COLORS[st][0]), textFormat: { foregroundColor: rgb(STAGE_COLORS[st][1]) } } },
        },
      },
    })),
    // Sort and filter from the header row.
    { setBasicFilter: { filter: { range: range(2, undefined) } } },
  ];
  if (!summary) requests.push({ addSheet: { properties: { title: "Summary", index: 1, gridProperties: { rowCount: 40, columnCount: 4 } } } });
  const res = await sheetsFetch(accessToken, `${base}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests }) });
  const summaryId: number = summary?.properties.sheetId ?? res.replies?.find((r: any) => r.addSheet)?.addSheet.properties.sheetId;

  // ── Summary tab: counts that follow the Leads tab ─────────────────────
  const statRows: (string | number)[][] = [
    ["Total leads", "=COUNTA(Leads!A4:A)"],
    ["Came in the last 7 days", '=COUNTIF(Leads!G4:G,">="&(NOW()-7))'],
    ["Not called yet", '=COUNTIF(Leads!E4:E,"New Lead")'],
    ["", ""],
    ["By stage", "Leads"],
    ...o.stages.map((st) => [st, `=COUNTIF(Leads!E4:E,"${st}")`]),
  ];
  await sheetsFetch(accessToken, `${base}/values/Summary!A1:D40:clear`, { method: "POST" });
  await sheetsFetch(accessToken, `${base}/values/Summary!A1?valueInputOption=USER_ENTERED`, {
    method: "PUT",
    body: JSON.stringify({ values: [[`EstateKit  ·  ${o.agentName}  ·  Summary`], [`Updated ${when} (SAST)`], [""], ...statRows] }),
  });
  if (summaryId !== undefined) {
    const sr = (r0: number, r1: number, c0 = 0, c1 = 2) => ({ sheetId: summaryId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 });
    const byStage = 3 + 4; // row index of "By stage"
    await sheetsFetch(accessToken, `${base}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({
        requests: [
          { repeatCell: { range: { sheetId: summaryId }, cell: { userEnteredFormat: {} }, fields: "userEnteredFormat" } },
          { unmergeCells: { range: sr(0, 2) } },
          { mergeCells: { range: sr(0, 1), mergeType: "MERGE_ALL" } },
          { mergeCells: { range: sr(1, 2), mergeType: "MERGE_ALL" } },
          { repeatCell: { range: sr(0, 1), cell: { userEnteredFormat: { backgroundColor: BRAND, verticalAlignment: "MIDDLE", padding: { left: 10 }, textFormat: { bold: true, fontSize: 14, foregroundColor: WHITE } } }, fields: "userEnteredFormat(backgroundColor,verticalAlignment,padding,textFormat)" } },
          { repeatCell: { range: sr(1, 2), cell: { userEnteredFormat: { backgroundColor: BRAND_SOFT, padding: { left: 10 }, textFormat: { italic: true, fontSize: 9, foregroundColor: GREY } } }, fields: "userEnteredFormat(backgroundColor,padding,textFormat)" } },
          { repeatCell: { range: sr(3, 6, 1, 2), cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 14 }, horizontalAlignment: "CENTER" } }, fields: "userEnteredFormat(textFormat,horizontalAlignment)" } },
          { repeatCell: { range: sr(byStage, byStage + 1), cell: { userEnteredFormat: { backgroundColor: BRAND_SOFT, textFormat: { bold: true } } }, fields: "userEnteredFormat(backgroundColor,textFormat)" } },
          { repeatCell: { range: sr(byStage + 1, byStage + 1 + o.stages.length, 1, 2), cell: { userEnteredFormat: { horizontalAlignment: "CENTER" } }, fields: "userEnteredFormat.horizontalAlignment" } },
          { updateDimensionProperties: { range: { sheetId: summaryId, dimension: "ROWS", startIndex: 0, endIndex: 1 }, properties: { pixelSize: 42 }, fields: "pixelSize" } },
          { updateDimensionProperties: { range: { sheetId: summaryId, dimension: "COLUMNS", startIndex: 0, endIndex: 1 }, properties: { pixelSize: 230 }, fields: "pixelSize" } },
          { updateDimensionProperties: { range: { sheetId: summaryId, dimension: "COLUMNS", startIndex: 1, endIndex: 2 }, properties: { pixelSize: 110 }, fields: "pixelSize" } },
        ],
      }),
    });
  }
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
      const title = `EstateKit · ${agentLabel} · ${pipeline.name} leads`;
      const folderId = useOAuth ? await getOrCreateFolder(accessToken) : (await secret("GOOGLE_SHEETS_FOLDER_ID")) ?? null;
      const result = await createSheet(accessToken, title, folderId);
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
      .select("id, name, phone, email, stage, next_label, note, created_at, fb_lead_id, source_page_id")
      .eq("pipeline_id", pipeline_id)
      .eq("archived", false)
      .order("created_at", { ascending: false });

    await renderSheet(accessToken, spreadsheetId, {
      agentName: profile?.display_name || "Agent",
      pipelineName: pipeline.name,
      stages,
      leads: leads || [],
    });

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

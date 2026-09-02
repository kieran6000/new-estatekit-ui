/**
 * EstateKit backend — Google Apps Script Web App.
 * Deploy this as a Web App (Execute as: Me, Access: Anyone), then set
 * VITE_API_URL in the frontend to the deployment URL.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ONE-TIME SETUP (see SETUP.md for the full walkthrough):
 *  1. Create a blank Google Sheet — this is the CONTROL spreadsheet.
 *  2. Extensions → Apps Script → paste this file in as Code.gs.
 *  3. Project Settings → Script Properties, add:
 *       CONTROL_SHEET_ID   = <the control spreadsheet's ID>
 *       AUTH_SECRET        = <any long random string>
 *       TEXTMEBOT_API_KEY  = <your TextMeBot API key>
 *       CLIENT_SHEET_TEMPLATE_ID = <optional: a spreadsheet ID to copy for
 *                                    every new client — leave blank to build
 *                                    a fresh one from scratch each time>
 *  4. Deploy → New deployment → Web app → Execute as Me, Access Anyone.
 *  5. Run `runOneTimeSetup` once from the editor to seed the control sheet.
 *  6. Run `installTimeTrigger` once from the editor — this is what fires
 *     delayed automation steps (anything with delay_minutes > 0). Without
 *     it, only the instant (delay_minutes === 0) steps ever run.
 *  7. If you have accounts created before this file's automation/lead-page
 *     seeding existed, run `migrateSeedExistingAccounts` once to backfill
 *     them (idempotent — safe to run more than once).
 *
 * All new accounts default to the 'paid' tier — there's no free tier or
 * client-facing upgrade flow at launch, and there is deliberately no
 * 'tier.set' action a client session can call to change its own tier.
 * ─────────────────────────────────────────────────────────────────────────
 */

// ───────────────────────── Config / constants ─────────────────────────

const PROPS = PropertiesService.getScriptProperties();
const DEV_BYPASS_PHONE = '+10000000000';
const DEV_BYPASS_CODE = '000000';
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const OTP_TTL_SECONDS = 300; // 5 minutes

const RESERVED_TABS = [
  'Pipelines', 'LeadPages', 'CustomQuestions', 'Overview',
  'Automations', 'AutomationSteps', 'CallQuestions', 'SupportTickets', 'Profile',
];

// Lives in the CONTROL spreadsheet (not per-client) so the time-driven
// trigger can scan every client's due actions in one pass instead of
// opening every client spreadsheet on every run.
const PENDING_ACTIONS_HEADERS = [
  'id', 'spreadsheetId', 'agentId', 'leadId', 'dueAt', 'actionType',
  'templateText', 'payload', 'processed', 'createdAt',
];

// header/JSON-field/boolean-field config per table, used by the generic
// sheet<->object helpers below.
const SCHEMA = {
  Pipelines: { headers: ['id', 'name', 'kind'], json: [], bool: [] },
  LeadPages: {
    headers: ['id', 'name', 'pipelineId', 'agentName', 'headline', 'suburb', 'phone',
      'logoDataUrl', 'profilePhotoDataUrl', 'accentColor', 'showIntro', 'nameLabel',
      'phoneLabel', 'ctaLabel', 'thankYouHeadline', 'thankYouSubtext', 'fbPixelId'],
    json: [], bool: ['showIntro'],
  },
  CustomQuestions: {
    headers: ['id', 'pageId', 'label', 'type', 'options', 'helperText', 'required', 'isDefault', 'order'],
    json: ['options'], bool: ['required', 'isDefault'],
  },
  Overview: {
    headers: ['id', 'agent_id', 'date', 'spend', 'leads', 'leads_reached', 'appts',
      'appts_held', 'mandates', 'commission_expected', 'commission_earned'],
    json: [], bool: [],
  },
  Automations: {
    headers: ['id', 'name', 'trigger_type', 'trigger_stage', 'enabled', 'created_at'],
    json: [], bool: ['enabled'],
  },
  AutomationSteps: {
    headers: ['id', 'automation_id', 'step_order', 'delay_minutes', 'action_type', 'template_text', 'payload'],
    json: ['payload'], bool: [],
  },
  CallQuestions: { headers: ['id', 'agent_id', 'question', 'created_at'], json: [], bool: [] },
  SupportTickets: {
    headers: ['id', 'agent_id', 'type', 'priority', 'message', 'emailed', 'created_at'],
    json: [], bool: ['emailed'],
  },
  Profile: {
    headers: ['agent_id', 'display_name', 'whatsapp_number', 'tier', 'is_operator'],
    json: [], bool: ['is_operator'],
  },
  // pipeline leads tabs (tab name = pipeline id) all share this shape:
  Leads: {
    headers: ['id', 'agent_id', 'pipeline_id', 'source_page_id', 'name', 'phone', 'email',
      'stage', 'next_label', 'reminder_at', 'due', 'form_answers', 'note', 'commission',
      'created_at', 'updated_at'],
    json: ['form_answers'], bool: ['due'],
  },
};

// ───────────────────────── Web app entry point ─────────────────────────

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const req = JSON.parse(e.postData.contents);
    const result = route(req.action, req.payload || {}, req.token);
    return jsonOut({ ok: true, data: result });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err && err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  return jsonOut({ ok: true, data: 'EstateKit backend is up.' });
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function route(action, payload, token) {
  switch (action) {
    // ---- auth (no token required) ----
    case 'auth.requestCode': return authRequestCode(payload.phone);
    case 'auth.verifyCode': return authVerifyCode(payload.phone, payload.code);

    // ---- public, no token (lead-page form submit) ----
    case 'leadPages.submitMockLead':
      return submitPublicLead(payload.pageId, payload.name, payload.phone, payload.formAnswers, payload.email || null);

    // ---- everything else requires a valid token ----
    default: {
      const agentId = requireAgent(token);
      const ss = getClientSpreadsheet(agentId);
      switch (action) {
        case 'leads.list': return leadsList(ss, agentId);
        case 'leads.update': return leadsUpdate(ss, payload.id, payload.patch);
        case 'leads.create':
          return leadsCreate(ss, agentId, payload.name, payload.phone, payload.formAnswers,
            payload.pipelineId, payload.sourcePageId || null, payload.email || null);

        case 'pipelines.list': return genericList(ss, 'Pipelines');
        case 'pipelines.add': return pipelinesAdd(ss, payload.name, payload.kind);

        case 'overview.list': return genericList(ss, 'Overview');

        case 'support.sendCallQuestion': return supportSendCallQuestion(ss, agentId, payload.question);
        case 'support.sendTicket': return supportSendTicket(ss, agentId, payload);

        // tier.get only — everyone launches on 'paid' and there is no
        // client-facing upgrade flow yet, so a real client session must
        // never be able to grant itself a tier. Deliberately no 'tier.set'
        // case here; see src/api/tier.ts's setTier() comment on the
        // frontend side.
        case 'tier.get': return profileGet(ss).tier || 'paid';

        case 'leadPages.list': return genericList(ss, 'LeadPages');
        case 'leadPages.add': return leadPagesAdd(ss, agentId, payload.name, payload.pipelineId, payload.kind);
        case 'leadPages.update': return genericUpdate(ss, 'LeadPages', payload.id, payload.patch);

        case 'customQuestions.list':
          return genericList(ss, 'CustomQuestions').filter(function (q) { return q.pageId === payload.pageId; })
            .sort(function (a, b) { return a.order - b.order; });
        case 'customQuestions.add': return customQuestionsAdd(ss, payload.pageId, payload.data);
        case 'customQuestions.update': return genericUpdate(ss, 'CustomQuestions', payload.id, payload.patch);
        case 'customQuestions.remove': return customQuestionsRemove(ss, payload.id);
        case 'customQuestions.move': return customQuestionsMove(ss, payload.id, payload.direction);

        case 'automations.getIsOperator': return !!profileGet(ss).is_operator;
        case 'automations.list': return genericList(ss, 'Automations');
        case 'automations.listSteps': return genericList(ss, 'AutomationSteps');
        case 'automations.toggle': return genericUpdate(ss, 'Automations', payload.id, { enabled: payload.enabled });
        case 'automations.updateStep':
          return genericUpdate(ss, 'AutomationSteps', payload.step.id, {
            delay_minutes: payload.step.delay_minutes,
            template_text: payload.step.template_text,
            payload: payload.step.payload,
          });

        default: throw new Error('Unknown action: ' + action);
      }
    }
  }
}

// ───────────────────────── Auth ─────────────────────────

function authRequestCode(phone) {
  if (!phone) throw new Error('phone required');
  if (phone === DEV_BYPASS_PHONE) return {}; // no real OTP needed for the dev/test number
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  CacheService.getScriptCache().put('otp:' + phone, code, OTP_TTL_SECONDS);
  sendWhatsAppOtp(phone, code);
  return {};
}

function authVerifyCode(phone, code) {
  if (!phone || !code) throw new Error('phone and code required');
  const isDev = phone === DEV_BYPASS_PHONE && code === DEV_BYPASS_CODE;
  if (!isDev) {
    const cached = CacheService.getScriptCache().get('otp:' + phone);
    if (!cached || cached !== code) return { error: 'Invalid or expired code.' };
    CacheService.getScriptCache().remove('otp:' + phone);
  }
  const agentId = getOrCreateAccount(phone);
  const token = mintToken(agentId, phone);
  return { user: { id: agentId, phone: phone }, token: token };
}

function sendWhatsAppOtp(phone, code) {
  sendWhatsAppMessage(phone, 'Your EstateKit login code is ' + code);
}

// Shared by OTP delivery and automation execution.
function sendWhatsAppMessage(phone, text) {
  const apiKey = PROPS.getProperty('TEXTMEBOT_API_KEY');
  if (!apiKey) throw new Error('TEXTMEBOT_API_KEY not configured');
  const url = 'https://api.textmebot.com/send.php?recipient=' + encodeURIComponent(phone) +
    '&apikey=' + encodeURIComponent(apiKey) +
    '&text=' + encodeURIComponent(text);
  UrlFetchApp.fetch(url, { muteHttpExceptions: true });
}

function mintToken(agentId, phone) {
  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const payload = JSON.stringify({ a: agentId, p: phone, e: exp });
  const payloadB64 = Utilities.base64EncodeWebSafe(payload);
  const sig = Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(payloadB64, PROPS.getProperty('AUTH_SECRET')));
  return payloadB64 + '.' + sig;
}

function requireAgent(token) {
  if (!token) throw new Error('Not authenticated');
  const parts = token.split('.');
  if (parts.length !== 2) throw new Error('Bad token');
  const expectedSig = Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(parts[0], PROPS.getProperty('AUTH_SECRET')));
  if (expectedSig !== parts[1]) throw new Error('Bad token signature');
  const payload = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString());
  if (payload.e < Math.floor(Date.now() / 1000)) throw new Error('Token expired');
  return payload.a;
}

// ───────────────────────── Accounts / client spreadsheets ─────────────────────────

function getControlSheet() {
  return SpreadsheetApp.openById(PROPS.getProperty('CONTROL_SHEET_ID'));
}

function getOrCreateAccount(phone) {
  const ctrl = getControlSheet();
  const accounts = sheetGetOrCreate(ctrl, 'Accounts', ['phone', 'agent_id', 'spreadsheet_id', 'created_at']);
  const rows = readObjects(accounts, ['phone', 'agent_id', 'spreadsheet_id', 'created_at'], [], []);
  const existing = rows.find(function (r) { return r.phone === phone; });
  if (existing) return existing.agent_id;

  const agentId = Utilities.getUuid();
  const clientSs = createClientSpreadsheet(agentId, phone);
  appendObject(accounts, ['phone', 'agent_id', 'spreadsheet_id', 'created_at'], [], [],
    { phone: phone, agent_id: agentId, spreadsheet_id: clientSs.getId(), created_at: new Date().toISOString() });
  return agentId;
}

function getClientSpreadsheet(agentId) {
  const ctrl = getControlSheet();
  const accounts = sheetGetOrCreate(ctrl, 'Accounts', ['phone', 'agent_id', 'spreadsheet_id', 'created_at']);
  const rows = readObjects(accounts, ['phone', 'agent_id', 'spreadsheet_id', 'created_at'], [], []);
  const row = rows.find(function (r) { return r.agent_id === agentId; });
  if (!row) throw new Error('Account not found');
  return SpreadsheetApp.openById(row.spreadsheet_id);
}

function createClientSpreadsheet(agentId, phone) {
  const ss = SpreadsheetApp.create('EstateKit — ' + phone);
  // default sheet Apps Script creates:
  const defaultSheet = ss.getSheets()[0];
  defaultSheet.setName('Profile');
  defaultSheet.getRange(1, 1, 1, SCHEMA.Profile.headers.length).setValues([SCHEMA.Profile.headers]);
  defaultSheet.appendRow([agentId, '', phone, 'paid', true]);

  Object.keys(SCHEMA).forEach(function (name) {
    if (name === 'Profile' || name === 'Leads') return;
    sheetGetOrCreate(ss, name, SCHEMA[name].headers);
  });

  // seed two starter pipelines + their lead tabs, matching the mock's defaults
  const pipelineId1 = 'pipeline-seller-' + Utilities.getUuid().slice(0, 6);
  const pipelineId2 = 'pipeline-buyer-' + Utilities.getUuid().slice(0, 6);
  const pipelinesSheet = ss.getSheetByName('Pipelines');
  appendObject(pipelinesSheet, SCHEMA.Pipelines.headers, [], [], { id: pipelineId1, name: 'Seller', kind: 'seller' });
  appendObject(pipelinesSheet, SCHEMA.Pipelines.headers, [], [], { id: pipelineId2, name: 'Buyer', kind: 'buyer' });
  sheetGetOrCreate(ss, pipelineId1, SCHEMA.Leads.headers);
  sheetGetOrCreate(ss, pipelineId2, SCHEMA.Leads.headers);

  // seed default automations + steps and one default lead page per pipeline
  // so nothing is blank on a fresh account's first login.
  seedAutomations(ss);
  seedDefaultLeadPage(ss, agentId, pipelineId1, 'seller');
  seedDefaultLeadPage(ss, agentId, pipelineId2, 'buyer');

  return ss;
}

// ───────────────────────── Fresh-account seeding ─────────────────────────

// Same defaults the original mock's seedAutomations()/seedSteps() used —
// see git history of src/api/automations.ts prior to the real backend.
function seedAutomations(ss) {
  const autoSheet = sheetGetOrCreate(ss, 'Automations', SCHEMA.Automations.headers);
  if (autoSheet.getLastRow() >= 2) return; // already seeded — don't duplicate
  const stepSheet = sheetGetOrCreate(ss, 'AutomationSteps', SCHEMA.AutomationSteps.headers);
  const now = new Date().toISOString();

  const automations = [
    { id: 'auto-1', name: 'New lead ping', trigger_type: 'lead_created', trigger_stage: null, enabled: true, created_at: now },
    { id: 'auto-2', name: 'No-answer retry', trigger_type: 'stage_changed', trigger_stage: 'No Answer', enabled: true, created_at: now },
    { id: 'auto-3', name: 'Follow-up sequence', trigger_type: 'stage_changed', trigger_stage: 'Contacted', enabled: true, created_at: now },
    { id: 'auto-4', name: 'Appointment reminder', trigger_type: 'stage_changed', trigger_stage: 'Booked', enabled: false, created_at: now },
  ];
  automations.forEach(function (a) { appendObject(autoSheet, SCHEMA.Automations.headers, SCHEMA.Automations.json, SCHEMA.Automations.bool, a); });

  const steps = [
    { id: 'step-1', automation_id: 'auto-1', step_order: 1, delay_minutes: 0, action_type: 'send_whatsapp', template_text: 'New lead: {{name}} ({{phone}}) just came in.', payload: {} },
    { id: 'step-2', automation_id: 'auto-2', step_order: 1, delay_minutes: 240, action_type: 'send_whatsapp', template_text: 'Still no answer from {{first_name}} — try again?', payload: {} },
    { id: 'step-3', automation_id: 'auto-3', step_order: 1, delay_minutes: 2880, action_type: 'send_whatsapp', template_text: 'Time to follow up with {{first_name}}.', payload: {} },
    { id: 'step-4', automation_id: 'auto-3', step_order: 2, delay_minutes: 4320, action_type: 'set_reminder', template_text: null, payload: { label: 'in 3 days', offset_minutes: 4320, due: true } },
    { id: 'step-5', automation_id: 'auto-4', step_order: 1, delay_minutes: 1440, action_type: 'send_whatsapp', template_text: 'Appointment with {{first_name}} is coming up.', payload: {} },
  ];
  steps.forEach(function (s) { appendObject(stepSheet, SCHEMA.AutomationSteps.headers, SCHEMA.AutomationSteps.json, SCHEMA.AutomationSteps.bool, s); });
}

// Matches the frontend's src/lib/leadFormTemplate.ts copy so a fresh
// account's "My Page" reads the same as the old mock's starting point.
const LEAD_PAGE_TEMPLATES = {
  seller: {
    pageName: 'Seller page',
    headline: 'Find out what your home is worth — free, no obligation.',
    ctaLabel: 'Get my free estimate',
    thankYouHeadline: 'Thanks {name}, your estimate is on its way',
    thankYouSubtext: "We'll be in touch shortly to confirm a few details.",
  },
  buyer: {
    pageName: 'Buyer page',
    headline: 'Find your next home — free, no obligation.',
    ctaLabel: 'Get matched with listings',
    thankYouHeadline: "Thanks {name}, we're on it",
    thankYouSubtext: "We'll be in touch shortly with matching listings.",
  },
};

// Used both for fresh-account seeding and the one-off migration below —
// unlike leadPagesAdd (a blank page an agent explicitly asks to create),
// this pre-fills the kind-specific copy so My Page isn't an empty form on
// first login.
function seedDefaultLeadPage(ss, agentId, pipelineId, kind) {
  const t = LEAD_PAGE_TEMPLATES[kind] || LEAD_PAGE_TEMPLATES.seller;
  const sheet = sheetGetOrCreate(ss, 'LeadPages', SCHEMA.LeadPages.headers);
  const id = 'page-' + Utilities.getUuid().slice(0, 8);
  const row = {
    id: id, name: t.pageName, pipelineId: pipelineId, agentName: '', headline: t.headline, suburb: '', phone: '',
    logoDataUrl: null, profilePhotoDataUrl: null, accentColor: '#1976d2', showIntro: true,
    nameLabel: "What's your name?", phoneLabel: 'WhatsApp number', ctaLabel: t.ctaLabel,
    thankYouHeadline: t.thankYouHeadline, thankYouSubtext: t.thankYouSubtext, fbPixelId: '',
  };
  appendObject(sheet, SCHEMA.LeadPages.headers, SCHEMA.LeadPages.json, SCHEMA.LeadPages.bool, row);
  seedDefaultQuestions(ss, id, kind);

  const ctrl = getControlSheet();
  const idx = sheetGetOrCreate(ctrl, 'PageIndex', ['pageId', 'spreadsheetId', 'pipelineId', 'agentId']);
  appendObject(idx, ['pageId', 'spreadsheetId', 'pipelineId', 'agentId'], [], [],
    { pageId: id, spreadsheetId: ss.getId(), pipelineId: pipelineId, agentId: agentId });

  return row;
}

// One-off migration for accounts created before this seeding existed — run
// manually once from the Apps Script editor. Safe to run repeatedly: it
// only fills in what's actually missing (empty Automations tab, or a
// pipeline with no LeadPage yet) and never duplicates existing rows.
function migrateSeedExistingAccounts() {
  const ctrl = getControlSheet();
  const accounts = sheetGetOrCreate(ctrl, 'Accounts', ['phone', 'agent_id', 'spreadsheet_id', 'created_at']);
  const rows = readObjects(accounts, ['phone', 'agent_id', 'spreadsheet_id', 'created_at'], [], []);
  rows.forEach(function (acct) {
    try {
      const ss = SpreadsheetApp.openById(acct.spreadsheet_id);
      seedAutomations(ss);

      const pipelines = genericList(ss, 'Pipelines');
      const pages = genericList(ss, 'LeadPages');
      pipelines.forEach(function (p) {
        const hasPage = pages.some(function (pg) { return pg.pipelineId === p.id; });
        if (!hasPage) seedDefaultLeadPage(ss, acct.agent_id, p.id, p.kind);
      });

      // paid-tier default only applies going forward for NEW accounts —
      // deliberately not force-changing existing clients' tier here, since
      // that's a billing decision, not a data-migration one. Flagging in
      // SETUP.md instead.
      Logger.log('Migrated: ' + acct.phone);
    } catch (e) {
      Logger.log('Migration failed for ' + acct.phone + ': ' + e);
    }
  });
  Logger.log('Migration complete.');
}

// ───────────────────────── Generic sheet<->object helpers ─────────────────────────

function sheetGetOrCreate(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return sheet;
}

function rowToObject(row, headers, jsonFields, boolFields) {
  const obj = {};
  headers.forEach(function (h, i) {
    let v = row[i];
    if (jsonFields.indexOf(h) !== -1) {
      try { v = v ? JSON.parse(v) : (h === 'options' ? undefined : []); } catch (e) { v = v; }
    } else if (boolFields.indexOf(h) !== -1) {
      v = (v === true || v === 'TRUE' || v === 'true');
    } else if (v instanceof Date) {
      v = v.toISOString();
    }
    obj[h] = v;
  });
  return obj;
}

function readObjects(sheet, headers, jsonFields, boolFields) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  return values.map(function (row) { return rowToObject(row, headers, jsonFields, boolFields); });
}

function objectToRow(headers, jsonFields, obj) {
  return headers.map(function (h) {
    let v = obj[h];
    if (v === undefined) v = '';
    if (jsonFields.indexOf(h) !== -1) return JSON.stringify(v === undefined ? null : v);
    return v;
  });
}

function appendObject(sheet, headers, jsonFields, boolFields, obj) {
  sheet.appendRow(objectToRow(headers, jsonFields, obj));
  return obj;
}

function findRowIndexById(sheet, headers, id) {
  const idCol = headers.indexOf('id') + 1;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  const ids = sheet.getRange(2, idCol, lastRow - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (ids[i][0] === id) return i + 2; // 1-indexed, +header row
  return -1;
}

function updateRowById(sheet, headers, jsonFields, id, patch) {
  const rowIdx = findRowIndexById(sheet, headers, id);
  if (rowIdx === -1) return false;
  // Parse jsonFields off the raw row before merging — merging the patch
  // onto the still-JSON-encoded string and re-stringifying it would
  // double-encode any jsonField the patch doesn't happen to touch.
  const current = rowToObject(sheet.getRange(rowIdx, 1, 1, headers.length).getValues()[0], headers, jsonFields, []);
  const merged = Object.assign({}, current, patch);
  sheet.getRange(rowIdx, 1, 1, headers.length).setValues([objectToRow(headers, jsonFields, merged)]);
  return true;
}

function deleteRowById(sheet, headers, id) {
  const rowIdx = findRowIndexById(sheet, headers, id);
  if (rowIdx === -1) return false;
  sheet.deleteRow(rowIdx);
  return true;
}

function genericList(ss, tabName) {
  const schema = SCHEMA[tabName];
  const sheet = sheetGetOrCreate(ss, tabName, schema.headers);
  return readObjects(sheet, schema.headers, schema.json, schema.bool);
}

function genericUpdate(ss, tabName, id, patch) {
  const schema = SCHEMA[tabName];
  const sheet = sheetGetOrCreate(ss, tabName, schema.headers);
  updateRowById(sheet, schema.headers, schema.json, id, patch);
  return {};
}

function profileGet(ss) {
  const sheet = sheetGetOrCreate(ss, 'Profile', SCHEMA.Profile.headers);
  const rows = readObjects(sheet, SCHEMA.Profile.headers, SCHEMA.Profile.json, SCHEMA.Profile.bool);
  return rows[0] || {};
}

function profileSet(ss, patch) {
  const sheet = sheetGetOrCreate(ss, 'Profile', SCHEMA.Profile.headers);
  if (sheet.getLastRow() < 2) {
    appendObject(sheet, SCHEMA.Profile.headers, SCHEMA.Profile.json, SCHEMA.Profile.bool,
      Object.assign({ agent_id: '', display_name: '', whatsapp_number: '', tier: 'paid', is_operator: true }, patch));
  } else {
    const current = readObjects(sheet, SCHEMA.Profile.headers, SCHEMA.Profile.json, SCHEMA.Profile.bool)[0];
    updateRowById(sheet, SCHEMA.Profile.headers, SCHEMA.Profile.json, current.agent_id, patch);
  }
  return {};
}

// ───────────────────────── Leads ─────────────────────────

function pipelineTabNames(ss) {
  return ss.getSheets().map(function (s) { return s.getName(); })
    .filter(function (n) { return RESERVED_TABS.indexOf(n) === -1; });
}

function leadsList(ss, agentId) {
  const tabs = pipelineTabNames(ss);
  let all = [];
  tabs.forEach(function (tabName) {
    const sheet = ss.getSheetByName(tabName);
    all = all.concat(readObjects(sheet, SCHEMA.Leads.headers, SCHEMA.Leads.json, SCHEMA.Leads.bool));
  });
  return all;
}

function leadsUpdate(ss, id, patch) {
  const tabs = pipelineTabNames(ss);
  for (let i = 0; i < tabs.length; i++) {
    const sheet = ss.getSheetByName(tabs[i]);
    const rowIdx = findRowIndexById(sheet, SCHEMA.Leads.headers, id);
    if (rowIdx === -1) continue;
    const current = rowToObject(sheet.getRange(rowIdx, 1, 1, SCHEMA.Leads.headers.length).getValues()[0],
      SCHEMA.Leads.headers, SCHEMA.Leads.json, SCHEMA.Leads.bool);
    const merged = Object.assign({}, current, patch, { updated_at: new Date().toISOString() });
    sheet.getRange(rowIdx, 1, 1, SCHEMA.Leads.headers.length).setValues([objectToRow(SCHEMA.Leads.headers, SCHEMA.Leads.json, merged)]);
    if (patch.stage && patch.stage !== current.stage) {
      executeAutomationsForEvent(ss, merged.agent_id, merged, 'stage_changed', patch.stage);
    }
    return {};
  }
  throw new Error('Lead not found: ' + id);
}

function leadsCreate(ss, agentId, name, phone, formAnswers, pipelineId, sourcePageId, email) {
  const sheet = ss.getSheetByName(pipelineId);
  if (!sheet) throw new Error('Pipeline tab not found: ' + pipelineId);
  const now = new Date().toISOString();
  const lead = {
    id: Utilities.getUuid(), agent_id: agentId, pipeline_id: pipelineId, source_page_id: sourcePageId,
    name: name, phone: phone, email: email, stage: 'New Lead', next_label: 'Just came in',
    reminder_at: null, due: true, form_answers: formAnswers || [], note: '', commission: null,
    created_at: now, updated_at: now,
  };
  appendObject(sheet, SCHEMA.Leads.headers, SCHEMA.Leads.json, SCHEMA.Leads.bool, lead);
  executeAutomationsForEvent(ss, agentId, lead, 'lead_created', null);
  return lead;
}

// public lead-page submission — no auth token; resolve the client spreadsheet
// via the control sheet's PageIndex tab (written by leadPagesAdd).
function submitPublicLead(pageId, name, phone, formAnswers, email) {
  const ctrl = getControlSheet();
  const idx = sheetGetOrCreate(ctrl, 'PageIndex', ['pageId', 'spreadsheetId', 'pipelineId', 'agentId']);
  const rows = readObjects(idx, ['pageId', 'spreadsheetId', 'pipelineId', 'agentId'], [], []);
  const row = rows.find(function (r) { return r.pageId === pageId; });
  if (!row) throw new Error('Lead page not found');
  const ss = SpreadsheetApp.openById(row.spreadsheetId);
  return leadsCreate(ss, row.agentId, name, phone, formAnswers, row.pipelineId, pageId, email);
}

// ───────────────────────── Pipelines ─────────────────────────

function pipelinesAdd(ss, name, kind) {
  const sheet = ss.getSheetByName('Pipelines');
  const id = 'pipeline-' + Utilities.getUuid().slice(0, 8);
  const row = { id: id, name: name, kind: kind };
  appendObject(sheet, SCHEMA.Pipelines.headers, [], [], row);
  sheetGetOrCreate(ss, id, SCHEMA.Leads.headers); // the tab IS the pipeline
  return row;
}

// ───────────────────────── Support ─────────────────────────

function supportSendCallQuestion(ss, agentId, question) {
  const sheet = sheetGetOrCreate(ss, 'CallQuestions', SCHEMA.CallQuestions.headers);
  appendObject(sheet, SCHEMA.CallQuestions.headers, [], [],
    { id: Utilities.getUuid(), agent_id: agentId, question: question, created_at: new Date().toISOString() });
  return {};
}

function supportSendTicket(ss, agentId, args) {
  const sheet = sheetGetOrCreate(ss, 'SupportTickets', SCHEMA.SupportTickets.headers);
  const row = {
    id: Utilities.getUuid(), agent_id: agentId, type: args.type, priority: args.priority,
    message: args.message, emailed: false, created_at: new Date().toISOString(),
  };
  appendObject(sheet, SCHEMA.SupportTickets.headers, [], SCHEMA.SupportTickets.bool, row);
  try {
    MailApp.sendEmail(Session.getEffectiveUser().getEmail(),
      '[EstateKit] New support ticket (' + args.priority + ')',
      'Type: ' + args.type + '\nAgent: ' + agentId + '\n\n' + args.message);
    updateRowById(sheet, SCHEMA.SupportTickets.headers, [], row.id, { emailed: true });
    return { emailed: true };
  } catch (e) {
    return { emailed: false };
  }
}

// ───────────────────────── Automation execution ─────────────────────────

function mergeTemplate(template, lead) {
  if (!template) return template;
  const firstName = (lead.name || '').trim().split(/\s+/)[0] || lead.name || '';
  const vars = { name: lead.name || '', phone: lead.phone || '', email: lead.email || '', first_name: firstName };
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, function (m, key) {
    return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : m;
  });
}

// Fires whenever a lead is created or changes stage. `stage` is the new
// stage for a 'stage_changed' event, null for 'lead_created'.
function executeAutomationsForEvent(ss, agentId, lead, eventType, stage) {
  const automations = genericList(ss, 'Automations').filter(function (a) {
    if (!a.enabled || a.trigger_type !== eventType) return false;
    if (eventType === 'stage_changed' && a.trigger_stage !== stage) return false;
    return true;
  });
  if (!automations.length) return;

  const steps = genericList(ss, 'AutomationSteps');
  automations.forEach(function (a) {
    const mySteps = steps.filter(function (s) { return s.automation_id === a.id; })
      .sort(function (x, y) { return x.step_order - y.step_order; });
    mySteps.forEach(function (step) {
      if (step.delay_minutes > 0) {
        addPendingAction(ss, agentId, lead.id, step, step.delay_minutes);
      } else {
        executeStep(ss, agentId, lead, step);
      }
    });
  });
}

function executeStep(ss, agentId, lead, step) {
  try {
    if (step.action_type === 'send_whatsapp') {
      const profile = profileGet(ss);
      if (!profile.whatsapp_number) {
        Logger.log('Skipped automation step ' + step.id + ' for agent ' + agentId + ': no whatsapp_number on Profile.');
        return;
      }
      sendWhatsAppMessage(profile.whatsapp_number, mergeTemplate(step.template_text, lead));
    } else if (step.action_type === 'set_reminder') {
      const payload = step.payload || {};
      const offsetMinutes = typeof payload.offset_minutes === 'number' ? payload.offset_minutes : 0;
      const reminderAt = new Date(Date.now() + offsetMinutes * 60000).toISOString();
      leadsUpdateSilent(ss, lead.id, { reminder_at: reminderAt, next_label: payload.label || null, due: !!payload.due });
    } else {
      Logger.log('Unknown automation action_type: ' + step.action_type);
    }
  } catch (e) {
    Logger.log('Automation step ' + step.id + ' failed for agent ' + agentId + ': ' + e);
  }
}

// Same row-merge as leadsUpdate but never re-fires automations — used by
// executeStep (e.g. set_reminder) so a step can't recursively trigger
// stage-changed automations off its own side effect.
function leadsUpdateSilent(ss, id, patch) {
  const tabs = pipelineTabNames(ss);
  for (let i = 0; i < tabs.length; i++) {
    const sheet = ss.getSheetByName(tabs[i]);
    const rowIdx = findRowIndexById(sheet, SCHEMA.Leads.headers, id);
    if (rowIdx === -1) continue;
    const current = rowToObject(sheet.getRange(rowIdx, 1, 1, SCHEMA.Leads.headers.length).getValues()[0],
      SCHEMA.Leads.headers, SCHEMA.Leads.json, SCHEMA.Leads.bool);
    const merged = Object.assign({}, current, patch, { updated_at: new Date().toISOString() });
    sheet.getRange(rowIdx, 1, 1, SCHEMA.Leads.headers.length).setValues([objectToRow(SCHEMA.Leads.headers, SCHEMA.Leads.json, merged)]);
    return true;
  }
  return false;
}

// Apps Script can't block execution to wait out a delay, so delayed steps
// are parked here (in the CONTROL spreadsheet, so one time trigger can scan
// every client at once) and picked up by processPendingActions().
function addPendingAction(ss, agentId, leadId, step, delayMinutes) {
  const ctrl = getControlSheet();
  const sheet = sheetGetOrCreate(ctrl, 'PendingActions', PENDING_ACTIONS_HEADERS);
  const dueAt = new Date(Date.now() + delayMinutes * 60000).toISOString();
  appendObject(sheet, PENDING_ACTIONS_HEADERS, ['payload'], ['processed'], {
    id: Utilities.getUuid(), spreadsheetId: ss.getId(), agentId: agentId, leadId: leadId, dueAt: dueAt,
    actionType: step.action_type, templateText: step.template_text, payload: step.payload || {},
    processed: false, createdAt: new Date().toISOString(),
  });
}

// Install once from the Apps Script editor: creates a time-driven trigger
// that calls processPendingActions() every 10 minutes. Re-running this is
// safe but will create a duplicate trigger — check Triggers in the editor
// before running twice.
function installTimeTrigger() {
  ScriptApp.newTrigger('processPendingActions').timeBased().everyMinutes(10).create();
  Logger.log('Trigger installed — processPendingActions will run every 10 minutes.');
}

// The time-driven trigger's entry point. Scans every due, unprocessed
// PendingActions row (across all clients) and fires it.
function processPendingActions() {
  const ctrl = getControlSheet();
  const sheet = sheetGetOrCreate(ctrl, 'PendingActions', PENDING_ACTIONS_HEADERS);
  const rows = readObjects(sheet, PENDING_ACTIONS_HEADERS, ['payload'], ['processed']);
  const now = Date.now();

  rows.forEach(function (row) {
    if (row.processed || new Date(row.dueAt).getTime() > now) return;
    // Mark processed first — a slow WhatsApp send shouldn't leave the row
    // eligible for a second trigger run to pick up and double-fire.
    updateRowById(sheet, PENDING_ACTIONS_HEADERS, ['payload'], row.id, { processed: true });
    try {
      const clientSs = SpreadsheetApp.openById(row.spreadsheetId);
      const lead = findLeadById(clientSs, row.leadId);
      if (!lead) {
        Logger.log('Pending action ' + row.id + ': lead ' + row.leadId + ' no longer exists, skipping.');
        return;
      }
      executeStep(clientSs, row.agentId, lead, { id: row.id, action_type: row.actionType, template_text: row.templateText, payload: row.payload });
    } catch (e) {
      Logger.log('Pending action ' + row.id + ' failed: ' + e);
    }
  });
}

function findLeadById(ss, leadId) {
  const tabs = pipelineTabNames(ss);
  for (let i = 0; i < tabs.length; i++) {
    const sheet = ss.getSheetByName(tabs[i]);
    const rowIdx = findRowIndexById(sheet, SCHEMA.Leads.headers, leadId);
    if (rowIdx !== -1) {
      return rowToObject(sheet.getRange(rowIdx, 1, 1, SCHEMA.Leads.headers.length).getValues()[0],
        SCHEMA.Leads.headers, SCHEMA.Leads.json, SCHEMA.Leads.bool);
    }
  }
  return null;
}

// ───────────────────────── Lead pages / custom questions ─────────────────────────

function leadPagesAdd(ss, agentId, name, pipelineId, kind) {
  const sheet = ss.getSheetByName('LeadPages');
  const id = 'page-' + Utilities.getUuid().slice(0, 8);
  const row = {
    id: id, name: name, pipelineId: pipelineId, agentName: '', headline: '', suburb: '', phone: '',
    logoDataUrl: null, profilePhotoDataUrl: null, accentColor: '#1976d2', showIntro: true,
    nameLabel: "What's your name?", phoneLabel: 'WhatsApp number', ctaLabel: 'Submit',
    thankYouHeadline: 'Thanks, {name}!', thankYouSubtext: "We'll be in touch shortly.", fbPixelId: '',
  };
  appendObject(sheet, SCHEMA.LeadPages.headers, SCHEMA.LeadPages.json, SCHEMA.LeadPages.bool, row);
  seedDefaultQuestions(ss, id, kind);

  // index this page in the control sheet so public submissions can find it
  const ctrl = getControlSheet();
  const idx = sheetGetOrCreate(ctrl, 'PageIndex', ['pageId', 'spreadsheetId', 'pipelineId', 'agentId']);
  appendObject(idx, ['pageId', 'spreadsheetId', 'pipelineId', 'agentId'], [], [],
    { pageId: id, spreadsheetId: ss.getId(), pipelineId: pipelineId, agentId: agentId });

  return row;
}

const QUESTION_TEMPLATES = {
  seller: { addressLabel: 'Enter your full property address', secondQuestionLabel: 'When are you looking to sell?', secondOptions: ['ASAP', 'Within 3 months', 'Within 6 months', 'Just curious'] },
  buyer: { addressLabel: 'What area are you looking to buy in?', secondQuestionLabel: 'Budget', secondOptions: ['Under R1.5m', 'R1.5m – R2.5m', 'R2.5m – R3.5m', 'R3.5m+'] },
};

function seedDefaultQuestions(ss, pageId, kind) {
  const sheet = sheetGetOrCreate(ss, 'CustomQuestions', SCHEMA.CustomQuestions.headers);
  const t = QUESTION_TEMPLATES[kind] || QUESTION_TEMPLATES.seller;
  appendObject(sheet, SCHEMA.CustomQuestions.headers, SCHEMA.CustomQuestions.json, SCHEMA.CustomQuestions.bool,
    { id: pageId + '-address', pageId: pageId, label: t.addressLabel, type: 'address', options: undefined, helperText: 'e.g. 14 Loop St, Cape Town', required: true, isDefault: true, order: 0 });
  appendObject(sheet, SCHEMA.CustomQuestions.headers, SCHEMA.CustomQuestions.json, SCHEMA.CustomQuestions.bool,
    { id: pageId + '-second', pageId: pageId, label: t.secondQuestionLabel, type: 'multiple_choice', options: t.secondOptions, helperText: '', required: true, isDefault: true, order: 1 });
}

function customQuestionsAdd(ss, pageId, data) {
  const sheet = sheetGetOrCreate(ss, 'CustomQuestions', SCHEMA.CustomQuestions.headers);
  const existing = readObjects(sheet, SCHEMA.CustomQuestions.headers, SCHEMA.CustomQuestions.json, SCHEMA.CustomQuestions.bool)
    .filter(function (q) { return q.pageId === pageId; });
  const row = Object.assign({ id: Utilities.getUuid(), pageId: pageId, order: existing.length, isDefault: false }, data);
  appendObject(sheet, SCHEMA.CustomQuestions.headers, SCHEMA.CustomQuestions.json, SCHEMA.CustomQuestions.bool, row);
  return row;
}

function customQuestionsRemove(ss, id) {
  const sheet = ss.getSheetByName('CustomQuestions');
  const all = readObjects(sheet, SCHEMA.CustomQuestions.headers, SCHEMA.CustomQuestions.json, SCHEMA.CustomQuestions.bool);
  const row = all.find(function (q) { return q.id === id; });
  if (!row) return {};
  deleteRowById(sheet, SCHEMA.CustomQuestions.headers, id);
  const group = all.filter(function (q) { return q.pageId === row.pageId && q.id !== id; })
    .sort(function (a, b) { return a.order - b.order; });
  group.forEach(function (q, i) {
    if (q.order !== i) updateRowById(sheet, SCHEMA.CustomQuestions.headers, SCHEMA.CustomQuestions.json, q.id, { order: i });
  });
  return {};
}

function customQuestionsMove(ss, id, direction) {
  const sheet = ss.getSheetByName('CustomQuestions');
  const all = readObjects(sheet, SCHEMA.CustomQuestions.headers, SCHEMA.CustomQuestions.json, SCHEMA.CustomQuestions.bool);
  const row = all.find(function (q) { return q.id === id; });
  if (!row) return {};
  const group = all.filter(function (q) { return q.pageId === row.pageId; }).sort(function (a, b) { return a.order - b.order; });
  const idx = group.findIndex(function (q) { return q.id === id; });
  const swapWith = direction === 'up' ? idx - 1 : idx + 1;
  if (swapWith < 0 || swapWith >= group.length) return {};
  updateRowById(sheet, SCHEMA.CustomQuestions.headers, SCHEMA.CustomQuestions.json, group[idx].id, { order: swapWith });
  updateRowById(sheet, SCHEMA.CustomQuestions.headers, SCHEMA.CustomQuestions.json, group[swapWith].id, { order: idx });
  return {};
}

// ───────────────────────── One-time setup helper ─────────────────────────

// Run this once from the Apps Script editor (select it in the dropdown, hit
// Run) after creating the control spreadsheet and setting Script Properties.
function runOneTimeSetup() {
  const ctrl = getControlSheet();
  sheetGetOrCreate(ctrl, 'Accounts', ['phone', 'agent_id', 'spreadsheet_id', 'created_at']);
  sheetGetOrCreate(ctrl, 'PageIndex', ['pageId', 'spreadsheetId', 'pipelineId', 'agentId']);
  sheetGetOrCreate(ctrl, 'PendingActions', PENDING_ACTIONS_HEADERS);
  Logger.log('Control sheet initialized.');
}

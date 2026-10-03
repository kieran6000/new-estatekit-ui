// Click-through test of Automations → Workflows, in a real browser, against
// a mocked backend (no real accounts or data are touched).
//
//   npm run dev                         (needs .env.local with the Supabase URL/key)
//   BASE=http://localhost:5173 node scripts/e2e-workflow-builder.mjs
//
// Optional: PW_CHROMIUM=/path/to/chromium, SHOTS=/some/dir for screenshots.
// Copies today's real automations (as of Oct 2026) into the account and checks
// every one opens clean, every template, then builds a workflow with every step type on the
// main path and inside both branch paths, and exercises move, delete (with
// its confirm), undo/redo, the on-switch block, the daily-summary limits,
// the name, deleting a workflow, and History search. Exits 1 on any failure.
const BASE = process.env.BASE || "http://localhost:5173";
// Screenshots of signed-in pages against a mocked backend (no real data).
import { chromium } from "playwright";
const UID = "00000000-0000-4000-8000-000000000001", PID = "00000000-0000-4000-8000-0000000000aa";
const now = Date.now(), iso = (m) => new Date(now - m * 60000).toISOString();
const profile = { agent_id: UID, display_name: "Demo Agent", whatsapp_number: "+27 82 000 0000", is_operator: true, tier: "paid", email: "demo@example.com", area: "Bryanston", company: "Demo Realty", sidebar_color: "#1b2431", onboarded: true, automations_paused: false, renewal_date: "2027-01-01", adspend_balance: 1200, billing_type: "card", lead_confirmation_email: true, lead_email_body: null, avatar_url: null, sidebar_logo_url: null, fb_page_id: null, fb_ad_account_id: null, contract_pdf_url: null, updated_at: iso(10) };
const stages = ["New Lead", "No Answer", "Contacted", "Booked", "Mandate Signed", "Lost", "New Lead", "No Answer"];
const names = ["Thandi Mokoena", "Pieter van Wyk", "Aisha Patel", "Johan Botha", "Lerato Dlamini", "Sipho Nkosi", "Megan Smith", "Ruan Venter"];
const leads = names.map((n, i) => ({ id: `00000000-0000-4000-8000-00000000010${i}`, agent_id: UID, name: n, phone: `+27 82 555 01${i}${i}`, email: `${n.split(" ")[0].toLowerCase()}@example.com`, stage: stages[i], next_label: i === 1 ? "Call again" : "Just came in", reminder_at: i === 2 ? iso(-60) : null, due: i === 1 || i === 2, form_answers: [{ q: "When are you selling?", a: "In 3 months" }], note: i === 3 ? "Wants valuation Saturday" : "", commission: null, created_at: iso(i * 300 + 5), updated_at: iso(i * 100), pipeline_id: PID, source_page_id: null, fb_lead_id: null, archived: false, fb_ad_id: null, attribution: null, quality: i === 3 ? "weak" : "good", commission_received_at: null, confirmation_sent_at: null, confirmation_email_id: null, plan_token: null }));
const page = { id: "00000000-0000-4000-8000-0000000000bb", slug: "demo-home-value", pipeline_id: PID, agent_id: UID, agent_name: "Demo Agent", name: "Home Value", headline: "What is your home worth?", suburb: "Bryanston", phone: "+27 82 000 0000", logo_data_url: null, profile_photo_data_url: null, accent_color: "#1976d2", show_intro: true, name_label: "Your name", phone_label: "Phone", collect_email: true, cta_label: "Get my valuation", thank_you_headline: "Thanks!", thank_you_subtext: "I'll call you soon.", fb_pixel_id: "123", fb_page_id: null, source_type: "page", fb_form_id: null, fb_form_name: null, preset: null, preset_version: null, dq_headline: null, dq_text: null, dq_cta_label: null, dq_cta_url: null, created_at: iso(5000) };
const agents = [profile, ...["Agent One", "Agent Two", "Agent Three", "Agent Four"].map((n, i) => ({ ...profile, agent_id: `00000000-0000-4000-8000-00000000020${i}`, display_name: n, is_operator: false, whatsapp_number: i === 3 ? "" : "+27 82 111 22" + i + i }))];
const weekStartIso = (() => { const d = new Date(Date.now() + 7200000); const dow = (d.getUTCDay() + 6) % 7; return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - (dow + 7) * 86400000).toISOString().slice(0, 10); })();
const sendsRows = [
  { id: "s1", agent_id: "00000000-0000-4000-8000-000000000200", week_start: weekStartIso, period: "22 Sep – 28 Sep 2026", status: "sent", error: null, sent_by_name: "Kieran", sent_at: iso(120), first_opened_at: iso(60), last_opened_at: iso(10), open_count: 3 },
  { id: "s2", agent_id: "00000000-0000-4000-8000-000000000201", week_start: weekStartIso, period: "22 Sep – 28 Sep 2026", status: "sent", error: null, sent_by_name: "Kieran", sent_at: iso(90), first_opened_at: null, last_opened_at: null, open_count: 0 },
];
const report = { period: "22 Sep – 28 Sep 2026", thisWeek: { label: "22 Sep", leads: 14, called: 11, booked: 3, mandates: 1 }, lastWeek: { label: "15 Sep", leads: 9, called: 8, booked: 1, mandates: 0 }, typicalMins: 12, lastTypicalMins: 40, notCalled: 2, noAnswer: 4, campaign: { thisWeek: 14, total: 212, since: "Mar 2026" }, weeks: [{ label: "1 Sep", leads: 7, called: 6, booked: 1, mandates: 0 }, { label: "8 Sep", leads: 10, called: 9, booked: 2, mandates: 1 }, { label: "15 Sep", leads: 9, called: 8, booked: 1, mandates: 0 }, { label: "22 Sep", leads: 14, called: 11, booked: 3, mandates: 1 }] };
const automationsRows = [{"id":"fe8d453b-12e1-400b-9701-4d3a9f625e03","name":"New lead — instant agent ping","enabled":true,"trigger_type":"lead_created","trigger_stage":null,"created_at":"2026-08-28T13:53:41Z"},{"id":"71355fcc-c542-4223-97e6-50cf5ae92eae","name":"No Answer — retry nudge","enabled":true,"trigger_type":"stage_changed","trigger_stage":"No Answer","created_at":"2026-08-28T13:53:41Z"},{"id":"4b5468c9-a3a9-43ff-852c-65000f7db98e","name":"Booked — appt reminder + did-they-sign nudge","enabled":true,"trigger_type":"stage_changed","trigger_stage":"Booked","created_at":"2026-08-28T13:53:41Z"},{"id":"ed460cc6-2733-4fb6-b416-3bd80cf59fa2","name":"Contacted — follow-up sequence","enabled":true,"trigger_type":"stage_changed","trigger_stage":"Contacted","created_at":"2026-08-28T13:53:41Z"},{"id":"3d7c1cc2-70fd-43bf-bcea-02aa325ed260","name":"Mandate Signed — confirmation","enabled":true,"trigger_type":"stage_changed","trigger_stage":"Mandate Signed","created_at":"2026-09-03T11:05:23Z"},{"id":"8071add2-d440-4495-8840-d42496b7bea7","name":"Viewing Booked — prep reminder","enabled":false,"trigger_type":"stage_changed","trigger_stage":"Viewing Booked","created_at":"2026-09-03T11:05:23Z"},{"id":"40fb9709-dd1b-4804-b61d-dff3e6b1d307","name":"Offer Made — follow-up","enabled":false,"trigger_type":"stage_changed","trigger_stage":"Offer Made","created_at":"2026-09-03T11:05:23Z"},{"id":"13477b99-db05-49cc-be76-7eb0dd5f4fdc","name":"Daily â€” leads still to update","enabled":true,"trigger_type":"daily_digest","trigger_stage":null,"created_at":"2026-09-23T12:27:24Z"}];
const stepRows = [{"id":"1","automation_id":"13477b99-db05-49cc-be76-7eb0dd5f4fdc","step_order":1,"delay_minutes":0,"action_type":"send_whatsapp","template_text":"Hi {{first_name}}, hope you're well.\n\nYou have {{count}} {{leads_word}} that still need updating.\n\nTap here to update them: https://leads.estatekit.co/leads","payload":{}},{"id":"2","automation_id":"3d7c1cc2-70fd-43bf-bcea-02aa325ed260","step_order":0,"delay_minutes":0,"action_type":"send_whatsapp","template_text":"Congrats! {{first_name}} is signed up. Update: {{action_link}}","payload":{}},{"id":"3","automation_id":"40fb9709-dd1b-4804-b61d-dff3e6b1d307","step_order":0,"delay_minutes":0,"action_type":"send_whatsapp","template_text":"{{first_name}} made an offer! Keep the momentum going. {{action_link}}","payload":{}},{"id":"4","automation_id":"40fb9709-dd1b-4804-b61d-dff3e6b1d307","step_order":1,"delay_minutes":2880,"action_type":"send_whatsapp","template_text":"Any update on {{first_name}}'s offer? {{action_link}}","payload":{}},{"id":"5","automation_id":"4b5468c9-a3a9-43ff-852c-65000f7db98e","step_order":0,"delay_minutes":1440,"action_type":"send_whatsapp","template_text":"Appointment with {{first_name}} coming up — confirm details. {{action_link}}","payload":{}},{"id":"6","automation_id":"4b5468c9-a3a9-43ff-852c-65000f7db98e","step_order":1,"delay_minutes":4320,"action_type":"send_whatsapp","template_text":"Did {{first_name}} sign? Update their stage: {{action_link}}","payload":{}},{"id":"7","automation_id":"71355fcc-c542-4223-97e6-50cf5ae92eae","step_order":0,"delay_minutes":240,"action_type":"send_whatsapp","template_text":"Still need to retry {{first_name}}? {{action_link}}","payload":{}},{"id":"8","automation_id":"8071add2-d440-4495-8840-d42496b7bea7","step_order":0,"delay_minutes":1440,"action_type":"send_whatsapp","template_text":"Viewing with {{first_name}} coming up — confirm the time. {{action_link}}","payload":{}},{"id":"9","automation_id":"8071add2-d440-4495-8840-d42496b7bea7","step_order":1,"delay_minutes":4320,"action_type":"send_whatsapp","template_text":"How did the viewing with {{first_name}} go? Update: {{action_link}}","payload":{}},{"id":"10","automation_id":"ed460cc6-2733-4fb6-b416-3bd80cf59fa2","step_order":0,"delay_minutes":2880,"action_type":"send_whatsapp","template_text":"Following up with {{first_name}} yet? {{action_link}}","payload":{}},{"id":"11","automation_id":"ed460cc6-2733-4fb6-b416-3bd80cf59fa2","step_order":1,"delay_minutes":4320,"action_type":"send_whatsapp","template_text":"Still haven't closed the loop with {{first_name}}? {{action_link}}","payload":{}},{"id":"12","automation_id":"fe8d453b-12e1-400b-9701-4d3a9f625e03","step_order":0,"delay_minutes":0,"action_type":"send_whatsapp","template_text":"New lead: {{name}}. Tap to contact: {{action_link}}","payload":{}}];
// In-memory workflows table, so saving, listing and deleting really round-trip.
const wfTable = [];
let wfSeq = 0;
const logRows = [
  { id: 1, at: iso(30), what: "WhatsApp the agent", status: "Sent", detail: "Call Thandi now", lead_id: leads[0].id, lead: { name: "Thandi Mokoena" } },
  { id: 2, at: iso(90), what: "Email the lead", status: "Skipped", detail: "No email address", lead_id: leads[1].id, lead: { name: "Pieter van Wyk" } },
];
const pipeline = { id: PID, agent_id: UID, name: "Sellers", kind: "seller", created_at: iso(10000), sheet_url: null };

const b = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const ctx = await b.newContext({ viewport: { width: Number(process.env.W || 1366), height: Number(process.env.H || 860) } });
await ctx.route(/supabase\.co/, async (route) => {
  const req = route.request(), url = new URL(req.url()), path = url.pathname;
  const single = (req.headers()["accept"] || "").includes("vnd.pgrst.object");
  const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", headers: { "content-range": `0-${Array.isArray(body) ? body.length : 1}/${Array.isArray(body) ? body.length : 1}`, "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-expose-headers": "content-range" }, body: JSON.stringify(body) });
  if (req.method() === "OPTIONS") return json({});
  if (path.includes("/auth/v1/user")) return json({ id: UID, email: "demo@example.com", aud: "authenticated", role: "authenticated" });
  if (path.includes("/rpc/")) { const fn = path.split("/rpc/")[1]; if (fn === "is_operator") return json(true); return json([]); }
  const table = path.split("/rest/v1/")[1];
  if (table === "agent_profiles") return json(single ? profile : agents);
  if (table === "weekly_report_sends") return json(sendsRows);
  if (table === "leads") { const id = url.searchParams.get("id"); const rows = id ? leads.filter((l) => id.includes(l.id)) : leads; return json(single ? rows[0] ?? null : rows); }
  if (table === "lead_pages") return json(single ? page : [page]);
  if (table === "automations") return json(automationsRows);
  if (table === "automation_steps") return json(stepRows);
  if (table === "workflows") {
    const m = req.method(), eq = (k) => (url.searchParams.get(k) || "").replace(/^eq\./, "");
    if (m === "GET") return json(wfTable.filter((w) => (eq("agent_id") ? w.agent_id === eq("agent_id") : true) && (eq("is_template") ? String(w.is_template) === eq("is_template") : true)));
    if (m === "POST") {
      const body = JSON.parse(req.postData() || "{}");
      const row = { ...body, id: `00000000-0000-4000-9000-${String(++wfSeq).padStart(12, "0")}`, created_at: new Date().toISOString() };
      wfTable.push(row);
      return json(single ? row : [row], 201);
    }
    if (m === "PATCH") { const row = wfTable.find((w) => w.id === eq("id")); Object.assign(row, JSON.parse(req.postData() || "{}")); return json(single ? row : [row]); }
    if (m === "DELETE") { const i = wfTable.findIndex((w) => w.id === eq("id")); if (i >= 0) wfTable.splice(i, 1); return json([]); }
  }
  if (table === "workflow_log") return json(logRows);
  if (table === "pipelines") return json(single ? pipeline : [pipeline]);
  if (path.includes("/functions/v1/weekly-report")) { const b = JSON.parse(req.postData() || "{}"); if (b.action === "view") return b.token === "0".repeat(32) ? json({ error: "not_found" }, 404) : json({ period: "22 Sep – 28 Sep 2026", data: report, name: "Agent One", avatarUrl: null }); console.log("SEND", b.agentId, b.weekStart, b.period, Object.keys(b.data || {}).length, new Date().toISOString().slice(11, 19)); sendsRows.unshift({ id: "x" + Date.now(), agent_id: b.agentId, week_start: b.weekStart, period: b.period, status: "sent", error: null, sent_by_name: "Demo Agent", sent_at: new Date().toISOString(), first_opened_at: null, last_opened_at: null, open_count: 0 }); return json({ ok: true }); }
  if (path.includes("/functions/")) return json({});
  return json(single ? null : []);
});
await ctx.route(/^https:\/\/[^/]*(posthog|facebook|fbcdn|flagcdn|ipapi)/, (r) => r.abort());
const p = await ctx.newPage();
p.on("pageerror", (e) => console.log("PAGEERR", e.message.slice(0, 200)));
await p.goto(`${BASE}/login`);
await p.evaluate(({ UID, mode }) => {
  localStorage.setItem("ek-theme", mode);
  const exp = Math.floor(Date.now() / 1000) + 36000;
  localStorage.setItem("sb-yfcnsvrhojpysrzqrkdi-auth-token", JSON.stringify({ access_token: "x.eyJzdWIiOiIwIn0.x", token_type: "bearer", expires_in: 36000, expires_at: exp, refresh_token: "r", user: { id: UID, email: "demo@example.com", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {} } }));
}, { UID, mode: process.env.MODE || "dark" });

const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|WebSocket|ERR_/.test(m.text())) errors.push("console: " + m.text().slice(0, 200)); });
let fails = 0;
const ok = (cond, msg) => { console.log(`${cond ? "  ok  " : "  FAIL"} ${msg}`); if (!cond) fails++; };
const shot = (n) => (process.env.SHOTS ? p.screenshot({ path: `${process.env.SHOTS}/wf_${n}.png` }) : Promise.resolve());
const nodes = async (title) => p.locator(`button[aria-label^="${title}:"]`).count();
const addAt = async (i, label) => {
  await p.getByRole("button", { name: "Add a step here" }).nth(i).click();
  await p.getByRole("menuitem", { name: new RegExp("^" + label) }).click();
  await p.waitForTimeout(200);
};
const fixCount = async () => { const c = p.locator(".MuiChip-root", { hasText: /to fix/ }); return (await c.count()) ? parseInt(await c.first().innerText()) : 0; };
const done = async () => { await p.getByRole("button", { name: "Done", exact: true }).click(); await p.waitForTimeout(150); };

await p.goto(`${BASE}/admin/automations`);
await p.waitForTimeout(2500);
// The local-only DEV tier toggle floats over the panel's buttons; hide it.
await p.evaluate(() => { for (const el of document.querySelectorAll("div")) if (el.textContent?.trim().startsWith("DEV · TIER") && getComputedStyle(el).position === "fixed") el.remove(); });
await p.getByRole("tab", { name: /Workflows/ }).click();
await p.waitForTimeout(800);
ok((await p.locator("tbody tr").count()) === 0, "a new account starts with no workflows");
await p.getByRole("button", { name: "Copy today's setup here" }).click();
await p.waitForTimeout(1500);
const rows = await p.locator("tbody tr").count();
ok(rows === 8 && wfTable.length === 8, `copying today's setup saves the 8 automations as this account's workflows (${rows})`);
ok(wfTable.every((w) => w.published === false && w.agent_id === UID), "copies are saved to this account, switched off");
await shot("0_list");
ok((await p.locator('[data-testid="ErrorOutlinedIcon"]').count()) === 0, "none of today's workflows is flagged as broken");

// Sorting the list
await p.getByRole("button", { name: "Name", exact: true }).click(); await p.waitForTimeout(200);
const firstAZ = await p.locator("tbody tr td").first().innerText();
await p.getByRole("button", { name: "Name", exact: true }).click(); await p.waitForTimeout(200);
const firstZA = await p.locator("tbody tr td").first().innerText();
ok(firstAZ !== firstZA && firstAZ.localeCompare(firstZA) < 0, `Name sorts both ways (${firstAZ.slice(0, 20)} / ${firstZA.slice(0, 20)})`);

// Open every workflow, nothing to fix, back again
const wfNames = await p.locator("tbody tr td:first-child").allInnerTexts();
for (const n of wfNames) {
  await p.locator("tbody tr", { hasText: n.trim() }).first().click();
  await p.waitForTimeout(400);
  ok((await fixCount()) === 0, `opens clean: ${n.trim().slice(0, 40)}`);
  await p.getByRole("button", { name: "Back to workflows" }).click();
  await p.waitForTimeout(300);
}

// Templates: each opens with nothing to fix (blank: 1)
for (const t of ["No answer → email follow-up", "New lead: speed to lead", "Not tracked: stay in touch", "Blank workflow"]) {
  await p.getByRole("button", { name: "Create workflow" }).click();
  await p.getByText(t, { exact: true }).click();
  await p.waitForTimeout(400);
  const n = await fixCount();
  ok(t === "Blank workflow" ? n === 1 : n === 0, `template "${t}" opens with ${n} to fix`);
  if (t !== "Blank workflow") { await p.getByRole("button", { name: "Back to workflows" }).click(); await p.waitForTimeout(300); }
}

// ── Blank workflow: build one with every step type ──
const sw = p.getByRole("switch", { name: "Workflow on" });
await sw.click(); await p.waitForTimeout(300);
ok(!(await sw.isChecked()), "a broken workflow can't be switched on");
ok(await p.getByText(/Fix 1 thing first/).isVisible(), "…and it says why");
await shot("1_blank");
await done().catch(() => {});

await addAt(0, "If / else");
ok((await nodes("If / else")) === 1, "added an If / else");
// Add buttons now: [root0, yes0, no0, root1]
await addAt(1, "WhatsApp the agent");
await p.getByRole("textbox", { name: "Message to the agent" }).fill("Call {{first_name}} now: ");
await p.getByText("{{action_link}}", { exact: true }).click();
const msg = await p.getByRole("textbox", { name: "Message to the agent" }).inputValue();
ok(msg === "Call {{first_name}} now: {{action_link}}", `field button inserts at the cursor (${msg})`);
await done();
// [root0, yes0, yes1, no0, root1]
await addAt(3, "Email the lead");
await p.getByRole("textbox", { name: "Subject" }).fill("Hi {{first_name}}");
await p.getByRole("textbox", { name: "Email", exact: true }).fill("Thanks for your interest.\n{{agent_name}}");
await done();
ok((await nodes("WhatsApp the agent")) === 1 && (await nodes("Email the lead")) === 1, "a step on each path");
// root steps after the branch: wait → move stage → reminder → tag
const lastAdd = async () => (await p.getByRole("button", { name: "Add a step here" }).count()) - 1;
await addAt(await lastAdd(), "Wait"); await done();
ok((await fixCount()) >= 1, "a wait at the end is flagged");
await addAt(await lastAdd(), "Move stage"); await done();
await addAt(await lastAdd(), "Set reminder"); await done();
await addAt(await lastAdd(), "Add tag");
await p.getByRole("textbox", { name: "Tag", exact: true }).fill("Investor");
await done();
for (const t of ["If / else", "WhatsApp the agent", "Email the lead", "Wait", "Move stage", "Set reminder", "Add tag"]) ok((await nodes(t)) >= 1, `node on canvas: ${t}`);
await shot("2_built");
ok((await fixCount()) === 0, `everything filled in: nothing to fix (${await fixCount()})`);

// Number field: clearing and typing
await p.locator('button[aria-label^="Wait:"]').click();
const waitBox = p.getByRole("textbox", { name: "Wait", exact: true });
await waitBox.fill("");
ok((await waitBox.inputValue()) === "", "wait box can be cleared while typing");
await waitBox.type("12");
await p.locator('button[aria-label^="Wait:"]').click();
ok(await p.locator('button[aria-label^="Wait: Wait 12 days"]').count() === 1, "typed 12 → Wait 12 days");
await waitBox.fill("0"); await waitBox.blur();
ok((await waitBox.inputValue()) === "12", "0 isn't accepted; box shows the value in use");
await done();

// Move: select Move stage and move it up above the wait
const order = async () => (await p.locator('button[aria-label]').evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")).filter((a) => /^(Wait|Move stage|Set reminder|Add tag):/.test(a)).map((a) => a.split(":")[0])));
const before = await order();
await p.locator('button[aria-label^="Move stage:"]').click();
await p.getByRole("button", { name: "Move step up" }).click();
const after = await order();
ok(JSON.stringify(after) === JSON.stringify(["Move stage", "Wait", "Set reminder", "Add tag"]) && JSON.stringify(before) !== JSON.stringify(after), `moved up: ${after.join(" > ")}`);
ok(await p.getByRole("button", { name: "Move step up" }).isEnabled(), "can still move above the If / else");
await p.getByRole("button", { name: "Move step up" }).click();
ok(await p.getByRole("button", { name: "Move step up" }).isDisabled(), "can't move the first step further up");
ok(await p.getByRole("button", { name: "Move step down" }).isEnabled(), "…but can move it down");
await p.getByRole("button", { name: "Move step down" }).click();
await done();

// Delete with confirm; the confirm must not carry over to another step
await p.locator('button[aria-label^="Add tag:"]').click();
await p.getByRole("button", { name: "Delete step" }).click();
await p.locator('button[aria-label^="Set reminder:"]').click();
ok(await p.getByRole("button", { name: "Delete step" }).isVisible(), "a half-done delete doesn't carry over to the next step");
await p.locator('button[aria-label^="Add tag:"]').click();
await p.getByRole("button", { name: "Delete step" }).click();
await p.getByRole("button", { name: "Delete", exact: true }).click();
await p.waitForTimeout(200);
ok((await nodes("Add tag")) === 0, "deleted the tag step");

// Undo / redo from the keyboard (focus on the canvas)
await p.locator('button[aria-label^="Trigger:"]').focus();
await p.keyboard.press("Escape");
await p.keyboard.press("Control+z"); await p.waitForTimeout(200);
ok((await nodes("Add tag")) === 1, "Ctrl+Z brings the step back");
await p.keyboard.press("Control+Shift+z"); await p.waitForTimeout(200);
ok((await nodes("Add tag")) === 0, "Ctrl+Shift+Z removes it again");

// Deleting the branch removes both paths
await p.locator('button[aria-label^="If / else:"]').click();
await p.getByRole("button", { name: "Delete check and its paths" }).click();
await p.getByRole("button", { name: "Delete", exact: true }).click();
await p.waitForTimeout(200);
ok((await nodes("If / else")) === 0 && (await nodes("WhatsApp the agent")) === 0 && (await nodes("Email the lead")) === 0, "deleting the check deletes both paths");
await p.keyboard.press("Control+z"); await p.waitForTimeout(200);
ok((await nodes("If / else")) === 1 && (await nodes("Email the lead")) === 1, "undo brings the check and both paths back");

// On switch now works, and Save stores it
await sw.click(); await p.waitForTimeout(200);
ok(await sw.isChecked(), "a clean workflow switches on");
const before8 = wfTable.length;
await p.getByRole("button", { name: /^Save/ }).click();
await p.waitForTimeout(800);
const savedWf = wfTable[wfTable.length - 1];
ok(wfTable.length === before8 + 1 && savedWf.published === true && savedWf.definition.steps.length >= 4, "Save stores the workflow, switched on, with its steps");
ok(await p.getByRole("button", { name: /^Save/ }).isDisabled(), "nothing left to save after saving");
await p.getByRole("switch", { name: "Workflow on" }).click();

// Trigger: daily summary limits steps
await p.locator('button[aria-label^="Trigger:"]').click();
await p.getByRole("combobox", { name: "Start this workflow when" }).click();
await p.getByRole("option", { name: "Every weekday at a set time" }).click();
await p.waitForTimeout(200);
ok((await fixCount()) > 0, `daily summary flags lead steps (${await fixCount()} to fix)`);
await done();
await p.getByRole("button", { name: "Add a step here" }).first().click();
const opts = await p.getByRole("menuitem").allInnerTexts();
ok(opts.length === 2, `daily summary's add menu offers only Wait and WhatsApp the agent (${opts.length})`);
await p.keyboard.press("Escape");
await p.waitForTimeout(200);
ok(await p.locator('button[aria-label^="Trigger:"]').isVisible(), "Escape in a menu doesn't break the canvas");

// Name can't be left empty
await p.getByRole("button", { name: /Untitled workflow/ }).click();
await p.getByRole("textbox", { name: "Workflow name" }).fill("");
await p.keyboard.press("Enter");
ok(await p.getByText("Untitled workflow").first().isVisible(), "an empty name goes back to Untitled workflow");

// Leaving with unsaved changes asks first
await p.getByRole("button", { name: "Back to workflows" }).click();
ok(await p.getByText("Leave without saving?").isVisible(), "leaving with unsaved changes asks first");
await p.getByRole("button", { name: "Keep editing" }).click();

// Settings: delete workflow
await p.getByRole("tab", { name: "Settings" }).click();
await p.getByRole("button", { name: "Delete", exact: true }).click();
await p.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
await p.waitForTimeout(600);
ok(await p.getByRole("button", { name: "Create workflow" }).isVisible(), "deleting the workflow returns to the list");
ok(!wfTable.some((w) => w.id === savedWf.id), "…and removes it from the database");

// History tab sorts and filters
await p.locator("tbody tr").first().click();
await p.getByRole("tab", { name: "History" }).click();
await p.getByPlaceholder("Find a lead").fill("thandi");
ok((await p.locator("tbody tr").count()) === 1, "history search filters");
await shot("3_history");

ok(errors.length === 0, `no page errors (${errors.join(" | ").slice(0, 300)})`);
console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
await b.close();
process.exit(fails ? 1 : 0);

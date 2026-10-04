// The workflow engine, run for real against an in-memory database: every
// step type, in different orders and nestings, and the things that go wrong
// (waits, quiet hours, the send limit, failed sends, edits under a waiting
// lead, paused or deactivated accounts, archived leads...).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDb } from "./fakeSupabase";
import { runWorkflows, type EngineDeps, type SendResult } from "./workflows";

(globalThis as unknown as { Deno: unknown }).Deno = {
  env: { get: (k: string) => ({ SUPABASE_SERVICE_ROLE_KEY: "test-key", RESEND_API_KEY: "re_test" } as Record<string, string>)[k] },
};

const AGENT = "agent-1";
let db: FakeDb;
let sent: { phone: string; text: string }[];
let emails: Record<string, unknown>[];
let discord: string[];
let sendResults: SendResult[];
let emailOk: boolean;
let quiet: Date | null;
let deps: EngineDeps;

type S = Record<string, unknown>;
let n = 0;
const id = () => `s${++n}`;
const wait = (amount: number, unit = "days"): S => ({ id: id(), type: "wait", amount, unit });
const wa = (text: string): S => ({ id: id(), type: "whatsapp_agent", text });
const email = (subject: string, body: string): S => ({ id: id(), type: "email_lead", subject, body });
const stage = (s: string): S => ({ id: id(), type: "set_stage", stage: s });
const rem = (label: string, inDays: number): S => ({ id: id(), type: "reminder", label, inDays });
const tag = (t: string): S => ({ id: id(), type: "tag", tag: t });
const branch = (check: string, value: string, yes: S[], no: S[]): S => ({ id: id(), type: "branch", check, value, yes, no });

function workflow(steps: S[], opts: { trigger?: S; filters?: S[]; exits?: S[]; quietHours?: boolean; published?: boolean; name?: string } = {}) {
  const row = {
    id: `wf-${++n}`,
    agent_id: AGENT,
    name: opts.name ?? "Test workflow",
    published: opts.published ?? true,
    definition: {
      trigger: opts.trigger ?? { kind: "stage_changed", stage: "No Answer" },
      filters: opts.filters ?? [],
      steps,
      exits: opts.exits ?? [{ kind: "booked", on: true }, { kind: "lost", on: true }, { kind: "any_stage_change", on: false }],
      settings: { quietHours: opts.quietHours ?? true, reEnter: false },
    },
  };
  db.tables.workflows.push(row);
  return row;
}

function lead(patch: S = {}) {
  const row = {
    id: `lead-${++n}`, agent_id: AGENT, name: "Thandi Mokoena", phone: "0825550199", email: "thandi@example.com", stage: "No Answer",
    next_label: "Call", pipeline_id: "pS", source_page_id: "pg1", fb_lead_id: null, quality: "good", tags: [], email_opt_out: false,
    archived: false, form_answers: [{ q: "Property address", a: "14 oak avenue" }], plan_token: null, reminder_at: null, due: false,
    created_at: new Date().toISOString(), ...patch,
  };
  db.tables.leads.push(row);
  return row;
}

function enroll(wf: { id: string }, l: { id: string; stage?: unknown } | null, patch: S = {}) {
  const row = {
    id: `run-${++n}`, workflow_id: wf.id, agent_id: AGENT, lead_id: l?.id ?? null, status: "pending", run_at: new Date(Date.now() - 1000).toISOString(),
    pos: [0], started: false, trigger_key: "", start_stage: (l?.stage as string) ?? null, last_email_id: null, ...patch,
  };
  db.tables.workflow_runs.push(row);
  return row;
}

const tick = () => runWorkflows(db as never, deps);
/** Move every waiting run to "now", as if its wait had passed. */
const timePasses = () => { for (const r of db.rows("workflow_runs")) if (r.status === "pending") r.run_at = new Date(Date.now() - 1000).toISOString(); };
const runOf = (r: { id: string }) => db.rows("workflow_runs").find((x) => x.id === r.id)!;
const leadOf = (l: { id: string }) => db.rows("leads").find((x) => x.id === l.id)!;
const logOf = (r: { id: string }) => db.rows("workflow_log").filter((x) => x.run_id === r.id).map((x) => `${x.what}: ${x.status}`);

beforeEach(() => {
  db = new FakeDb();
  db.tables = {
    workflows: [], workflow_runs: [], workflow_log: [], workflow_emails: [], lead_events: [], leads: [],
    agent_profiles: [{ agent_id: AGENT, display_name: "Megan Agent", whatsapp_number: "+27820000000", email: "megan@realty.co.za", company: "Realty", automations_paused: false, deactivated_at: null }],
    pipelines: [{ id: "pS", kind: "seller" }, { id: "pB", kind: "buyer" }],
    lead_pages: [{ id: "pg1", suburb: "Bryanston, Sandton", fb_pixel_id: "123", phone: "0825550000", magnet_kind: null }, { id: "pg2", suburb: "Fourways", fb_pixel_id: null, phone: null, magnet_kind: "none" }],
  };
  sent = []; emails = []; discord = []; sendResults = []; emailOk = true; quiet = null;
  deps = {
    sendWhatsApp: async (phone, text) => { sent.push({ phone, text }); return sendResults.shift() ?? "sent"; },
    actionLink: async (leadId) => `https://leads.estatekit.co/l/x${leadId.slice(-4)}`,
    linkTypeFor: () => "first_touch",
    quietDeferUntil: () => quiet,
    budget: { sends: 0 },
    maxSends: 8,
    logToDiscord: async (m) => { discord.push(m); },
  };
  globalThis.fetch = vi.fn(async (_url: unknown, init?: { body?: string }) => {
    emails.push(JSON.parse(init?.body ?? "{}"));
    return new Response(emailOk ? JSON.stringify({ id: "re_1" }) : "nope", { status: emailOk ? 200 : 422 });
  }) as never;
});

describe("steps in order", () => {
  it("runs every instant step in one go and finishes", async () => {
    const wf = workflow([tag("Hot"), stage("Contacted"), rem("Call {{first_name}} back", 2), wa("Call {{first_name}}: {{action_link}}")]);
    const l = lead();
    const r = enroll(wf, l);
    await tick();
    expect(runOf(r).status).toBe("completed");
    expect(leadOf(l).tags).toEqual(["Hot"]);
    expect(leadOf(l).stage).toBe("Contacted");
    expect(leadOf(l).next_label).toBe("Call Thandi back");
    expect(leadOf(l).due).toBe(true);
    expect(sent).toEqual([{ phone: "+27820000000", text: `Call Thandi: https://leads.estatekit.co/l/x${l.id.slice(-4)}` }]);
    expect(logOf(r)).toEqual(["Add tag: Done", "Move stage: Done", "Set reminder: Done", "WhatsApp the agent: Sent"]);
    expect(db.rows("lead_events").map((e) => e.event_type)).toEqual(["tagged", "whatsapp_sent"]);
    expect(discord[0]).toMatch(/Workflow \*\*Test workflow\*\* sent WhatsApp to \*\*Megan Agent\*\* re: Thandi Mokoena/);
  });

  it("fills in the lead's details and every form answer", async () => {
    db.tables.lead_pages[0].name = "Home Value page";
    const wf = workflow([wa("{{name}} | {{phone}} | {{email}} | {{address}} | {{form}}\n{{answers}}")]);
    lead({ form_answers: [{ q: "When are you selling?", a: "In 3 months" }, { q: "Property address", a: "14 oak avenue" }, { q: "Skipped", a: "" }] });
    lead({ email: null, fb_lead_id: "fb1", form_answers: [] });
    for (const l of db.rows("leads")) enroll(wf, l as never);
    await tick();
    expect(sent[0].text).toBe("Thandi Mokoena | 082 555 0199 | thandi@example.com | 14 Oak Avenue | Home Value page\nWhen are you selling?: In 3 months\nProperty address: 14 oak avenue");
    expect(sent[1].text).toBe("Thandi Mokoena | 082 555 0199 | no email |  | Facebook form\nNo answers");
  });

  it("waits, then carries on from the right step", async () => {
    const wf = workflow([wa("first"), wait(2, "days"), wa("second"), wait(30, "minutes"), wa("third")]);
    const r = enroll(wf, lead());
    await tick();
    expect(sent.map((s) => s.text)).toEqual(["first"]);
    expect(runOf(r).status).toBe("pending");
    expect(runOf(r).pos).toEqual([2]);
    const due = Date.parse(runOf(r).run_at as string) - Date.now();
    expect(due).toBeGreaterThan(2 * 86400_000 - 60_000);
    await tick(); // not due yet: nothing happens
    expect(sent).toHaveLength(1);
    timePasses(); await tick();
    expect(sent.map((s) => s.text)).toEqual(["first", "second"]);
    expect(runOf(r).pos).toEqual([4]);
    timePasses(); await tick();
    expect(sent.map((s) => s.text)).toEqual(["first", "second", "third"]);
    expect(runOf(r).status).toBe("completed");
  });

  it("a wait as the very first step", async () => {
    const wf = workflow([wait(4, "hours"), wa("later")]);
    const r = enroll(wf, lead());
    await tick();
    expect(sent).toHaveLength(0);
    expect(runOf(r).pos).toEqual([1]);
    timePasses(); await tick();
    expect(sent.map((s) => s.text)).toEqual(["later"]);
  });
});

describe("if / else", () => {
  it("takes the Yes path, then the step after the check", async () => {
    const wf = workflow([branch("has_email", "", [tag("yes1"), tag("yes2")], [tag("no1")]), tag("after")]);
    const l = lead();
    enroll(wf, l);
    await tick();
    expect(leadOf(l).tags).toEqual(["yes1", "yes2", "after"]);
  });

  it("takes the No path", async () => {
    const wf = workflow([branch("has_email", "", [tag("yes")], [tag("no")]), tag("after")]);
    const l = lead({ email: null });
    enroll(wf, l);
    await tick();
    expect(leadOf(l).tags).toEqual(["no", "after"]);
  });

  it("an empty path goes straight to the next step", async () => {
    const wf = workflow([branch("stage_is", "Booked", [tag("booked")], []), tag("after")]);
    const l = lead();
    const r = enroll(wf, l);
    await tick();
    expect(leadOf(l).tags).toEqual(["after"]);
    expect(runOf(r).status).toBe("completed");
  });

  it("a branch as the last step, with nothing after it", async () => {
    const wf = workflow([tag("first"), branch("has_email", "", [tag("yes")], [tag("no")])]);
    const l = lead();
    const r = enroll(wf, l);
    await tick();
    expect(leadOf(l).tags).toEqual(["first", "yes"]);
    expect(runOf(r).status).toBe("completed");
  });

  it("a wait inside a path, then back out to the main path", async () => {
    const wf = workflow([branch("has_email", "", [tag("a"), wait(1), tag("b")], [tag("no")]), tag("after")]);
    const l = lead();
    const r = enroll(wf, l);
    await tick();
    expect(leadOf(l).tags).toEqual(["a"]);
    expect(runOf(r).pos).toEqual([0, "yes", 2]);
    timePasses(); await tick();
    expect(leadOf(l).tags).toEqual(["a", "b", "after"]);
    expect(runOf(r).status).toBe("completed");
  });

  it("a wait as the last step of a path continues after the check", async () => {
    const wf = workflow([branch("has_email", "", [tag("a"), wait(1)], []), tag("after")]);
    const l = lead();
    const r = enroll(wf, l);
    await tick();
    expect(runOf(r).pos).toEqual([1]);
    timePasses(); await tick();
    expect(leadOf(l).tags).toEqual(["a", "after"]);
  });

  it("checks inside checks (three deep)", async () => {
    const wf = workflow([
      branch("pipeline_is", "Sellers", [
        branch("source_is", "EstateKit page", [
          branch("stage_is", "No Answer", [tag("deepest")], [tag("wrong stage")]),
          tag("after inner"),
        ], [tag("wrong source")]),
      ], [tag("buyer")]),
      tag("end"),
    ]);
    const l = lead();
    enroll(wf, l);
    await tick();
    expect(leadOf(l).tags).toEqual(["deepest", "after inner", "end"]);
  });

  it("every check reads the lead correctly", async () => {
    const mk = (check: string, value: string, patch: S = {}) => {
      const wf = workflow([branch(check, value, [tag("Y")], [tag("N")])]);
      const l = lead(patch);
      enroll(wf, l);
      return l;
    };
    const cases = [
      [mk("stage_is", "No Answer"), "Y"], [mk("stage_is", "Booked"), "N"],
      [mk("has_email", ""), "Y"], [mk("has_email", "", { email: "" }), "N"], [mk("has_email", "", { email_opt_out: true }), "N"],
      [mk("source_is", "EstateKit page"), "Y"], [mk("source_is", "Facebook form", { fb_lead_id: "fb1" }), "Y"], [mk("source_is", "Added by hand", { source_page_id: null }), "Y"],
      [mk("pipeline_is", "Sellers"), "Y"], [mk("pipeline_is", "Buyers"), "N"], [mk("pipeline_is", "Buyers", { pipeline_id: "pB" }), "Y"],
      [mk("has_tag", "VIP", { tags: ["vip"] }), "Y"], [mk("has_tag", "VIP"), "N"],
      [mk("has_tag", "Not tracked", { quality: "weak" }), "Y"], [mk("has_tag", "Not tracked", { source_page_id: "pg2" }), "Y"],
      [mk("has_tag", "Not tracked"), "N"], [mk("has_tag", "Not tracked", { fb_lead_id: "fb1", quality: "weak" }), "N"],
      [mk("opened_last_email", ""), "N"],
    ] as const;
    await tick();
    for (const [l, want] of cases) expect(leadOf(l).tags).toContain(want);
  });
});

describe("emails to the lead", () => {
  it("sends with every field filled, the unsubscribe link and the open pixel", async () => {
    const wf = workflow([email("Hi {{first_name}} in {{area}}", "About {{address}}.\n\n{{agent_name}}\n{{agent_phone}}\nPlan: {{plan_link}}")]);
    const l = lead();
    const r = enroll(wf, l);
    await tick();
    expect(emails).toHaveLength(1);
    const e = emails[0] as { to: string[]; subject: string; text: string; html: string; reply_to: string; from: string };
    expect(e.to).toEqual(["thandi@example.com"]);
    expect(e.subject).toBe("Hi Thandi in Bryanston");
    expect(e.text).toContain("About 14 Oak Avenue.");
    expect(e.text).toContain("Megan Agent\n082 555 0000");
    expect(e.text).toMatch(/Plan: https:\/\/leads\.estatekit\.co\/plan\/[a-f0-9]{32}/);
    expect(e.reply_to).toBe("megan@realty.co.za");
    expect(e.from).toBe("Megan Agent <hello@mail.estatekit.co>");
    expect(e.html).toMatch(/\/unsubscribe\/lead-\d+\/[a-f0-9]{32}/);
    expect(e.html).toMatch(/\/oe\/[0-9a-f-]+/);
    expect(leadOf(l).plan_token).toMatch(/^[a-f0-9]{32}$/);
    expect(runOf(r).last_email_id).toBe(db.rows("workflow_emails")[0].id);
    expect(db.rows("lead_events").map((x) => x.event_type)).toEqual(["workflow_email"]);
  });

  it("skips leads with no email, or who unsubscribed, and carries on", async () => {
    const wf = workflow([email("Hi", "Body"), tag("after")]);
    const a = lead({ email: null });
    const b = lead({ email_opt_out: true });
    const ra = enroll(wf, a); const rb = enroll(wf, b);
    await tick();
    expect(emails).toHaveLength(0);
    expect(logOf(ra)).toEqual(["Email the lead: Skipped", "Add tag: Done"]);
    expect(logOf(rb)[0]).toBe("Email the lead: Skipped");
    expect(leadOf(b).tags).toEqual(["after"]);
  });

  it("a failed email is logged, not counted, and the workflow carries on", async () => {
    emailOk = false;
    const wf = workflow([email("Hi", "Body"), tag("after")]);
    const l = lead();
    const r = enroll(wf, l);
    await tick();
    expect(logOf(r)).toEqual(["Email the lead: Failed", "Add tag: Done"]);
    expect(db.rows("workflow_emails")).toHaveLength(0);
    expect(runOf(r).last_email_id).toBeNull();
  });

  it("\"Opened the last email\" follows the open pixel", async () => {
    const wf = workflow([email("Hi", "Body"), wait(2), branch("opened_last_email", "", [tag("opened")], [tag("not opened")])]);
    const a = lead(); const b = lead();
    enroll(wf, a); enroll(wf, b);
    await tick();
    const ea = db.rows("workflow_emails").find((x) => x.lead_id === a.id)!;
    ea.opened_at = new Date().toISOString();
    timePasses(); await tick();
    expect(leadOf(a).tags).toEqual(["opened"]);
    expect(leadOf(b).tags).toEqual(["not opened"]);
  });

  it("the lead magnet link: an existing plan, a buyer form, a form with no magnet", async () => {
    const wf = workflow([email("Hi", "{{plan_link}}")]);
    lead({ plan_token: "a".repeat(32) });
    lead({ pipeline_id: "pB" });
    lead({ source_page_id: "pg2" });
    for (const l of db.rows("leads")) enroll(wf, l as never);
    await tick();
    const texts = emails.map((e) => String((e as { text: string }).text));
    expect(texts[0]).toContain(`/plan/${"a".repeat(32)}`);
    expect(texts[1]).toContain(`/sold/${AGENT}`);
    expect(texts[2]).toContain(`/sold/${AGENT}`);
  });
});

describe("sending limits and failures", () => {
  it("quiet hours hold WhatsApp and email at the same step, but never new-lead alerts", async () => {
    quiet = new Date(Date.now() + 8 * 3600_000);
    const held = workflow([tag("before"), wa("nudge"), tag("after")]);
    const alert = workflow([wa("new lead!")], { trigger: { kind: "lead_created" }, quietHours: false });
    const off = workflow([wa("no quiet hours")], { quietHours: false });
    const l = lead();
    const r1 = enroll(held, l); enroll(alert, l); enroll(off, l);
    await tick();
    expect(sent.map((s) => s.text).sort()).toEqual(["new lead!", "no quiet hours"]);
    expect(runOf(r1).pos).toEqual([1]);
    expect(Date.parse(runOf(r1).run_at as string)).toBe(quiet.getTime());
    quiet = null; timePasses(); await tick();
    expect(sent.map((s) => s.text)).toContain("nudge");
    expect(leadOf(l).tags).toEqual(["before", "after"]);
  });

  it("never sends more than the limit in one minute; the rest go next minute", async () => {
    const wf = workflow([wa("hello")]);
    const runs = Array.from({ length: 11 }, () => enroll(wf, lead()));
    await tick();
    expect(sent).toHaveLength(8);
    expect(runs.filter((r) => runOf(r).status === "pending")).toHaveLength(3);
    deps.budget.sends = 0; await tick();
    expect(sent).toHaveLength(11);
    expect(runs.every((r) => runOf(r).status === "completed")).toBe(true);
  });

  it("a rate-limited send is retried, not lost or doubled", async () => {
    sendResults = ["rate_limited"];
    const wf = workflow([wa("hello"), tag("after")]);
    const l = lead();
    const r = enroll(wf, l);
    await tick();
    expect(runOf(r).status).toBe("pending");
    expect(runOf(r).pos).toEqual([0]);
    expect(leadOf(l).tags).toEqual([]);
    timePasses(); await tick();
    expect(sent).toHaveLength(2);
    expect(logOf(r)).toEqual(["WhatsApp the agent: Sent", "Add tag: Done"]);
  });

  it("a failed send is logged and the workflow carries on", async () => {
    sendResults = ["failed"];
    const wf = workflow([wa("hello"), tag("after")]);
    const l = lead();
    const r = enroll(wf, l);
    await tick();
    expect(logOf(r)).toEqual(["WhatsApp the agent: Failed", "Add tag: Done"]);
    expect(discord[0]).toMatch(/could NOT send/);
  });

  it("an account with no WhatsApp number skips the message", async () => {
    db.tables.agent_profiles[0].whatsapp_number = "";
    const wf = workflow([wa("hello"), tag("after")]);
    const r = enroll(wf, lead());
    await tick();
    expect(sent).toHaveLength(0);
    expect(logOf(r)).toEqual(["WhatsApp the agent: Skipped", "Add tag: Done"]);
  });

  it("a database error fails that run only; the next run still goes", async () => {
    db.failOn = (t, op) => t === "leads" && op === "update";
    const wf = workflow([stage("Contacted")]);
    const bad = enroll(wf, lead());
    const wf2 = workflow([wa("still works")]);
    enroll(wf2, lead());
    await tick();
    expect(runOf(bad).status).toBe("failed");
    expect(logOf(bad)).toEqual(["Workflow: Failed"]);
    expect(sent.map((s) => s.text)).toEqual(["still works"]);
  });
});

describe("who gets in, and stopping early", () => {
  it("\"Only run if\" filters", async () => {
    const wf = workflow([tag("in")], { filters: [{ field: "pipeline", value: "Sellers" }, { field: "has_email", value: "yes" }, { field: "stage", value: "No Answer" }] });
    const yes = lead(); const buyer = lead({ pipeline_id: "pB" }); const noEmail = lead({ email: "" }); const other = lead({ stage: "Contacted" });
    const runs = [yes, buyer, noEmail, other].map((l) => enroll(wf, l));
    await tick();
    expect(runs.map((r) => runOf(r).status)).toEqual(["completed", "cancelled", "cancelled", "cancelled"]);
    expect(leadOf(yes).tags).toEqual(["in"]);
    expect(leadOf(buyer).tags).toEqual([]);
  });

  it("filters are checked once, at the start, not again after a wait", async () => {
    const wf = workflow([wait(1), tag("done")], { filters: [{ field: "stage", value: "No Answer" }] });
    const l = lead();
    const r = enroll(wf, l);
    await tick();
    leadOf(l).stage = "Contacted"; // no stop rule for this
    timePasses(); await tick();
    expect(runOf(r).status).toBe("completed");
    expect(leadOf(l).tags).toEqual(["done"]);
  });

  it("stops before the next step when the lead books or is lost", async () => {
    const wf = workflow([wa("one"), wait(1), wa("two")]);
    const a = lead(); const b = lead();
    const ra = enroll(wf, a); const rb = enroll(wf, b);
    await tick();
    leadOf(a).stage = "Booked"; leadOf(b).stage = "Lost";
    timePasses(); await tick();
    expect(sent.map((s) => s.text)).toEqual(["one", "one"]);
    expect(runOf(ra).status).toBe("stopped");
    expect(runOf(rb).stop_reason).toBe("Lead moved to Lost");
  });

  it("with the stop rules off, a booked lead still gets the rest", async () => {
    const wf = workflow([wait(1), wa("two")], { exits: [] });
    const l = lead();
    enroll(wf, l);
    await tick();
    leadOf(l).stage = "Booked";
    timePasses(); await tick();
    expect(sent.map((s) => s.text)).toEqual(["two"]);
  });

  it("\"stage changes at all\" ignores the workflow's own stage moves", async () => {
    const wf = workflow([stage("Contacted"), wait(1), tag("still going")], { exits: [{ kind: "any_stage_change", on: true }] });
    const l = lead();
    const r = enroll(wf, l);
    await tick();
    timePasses(); await tick();
    expect(runOf(r).status).toBe("completed");
    expect(leadOf(l).tags).toEqual(["still going"]);
    const l2 = lead(); const r2 = enroll(wf, l2);
    await tick();
    leadOf(l2).stage = "Booked"; // the agent moved it
    timePasses(); await tick();
    expect(runOf(r2).status).toBe("stopped");
  });

  it("moving to the stage it's already at does nothing", async () => {
    const wf = workflow([stage("No Answer")]);
    const l = lead();
    enroll(wf, l);
    await tick();
    expect(leadOf(l).stage).toBe("No Answer");
    expect(db.rows("lead_events")).toHaveLength(0);
  });
});

describe("accounts, leads and workflows that change", () => {
  it("a paused or deactivated account holds its runs; nothing is sent", async () => {
    const wf = workflow([wa("hi")]);
    const r = enroll(wf, lead());
    db.tables.agent_profiles[0].automations_paused = true;
    await tick();
    expect(runOf(r).status).toBe("paused");
    db.tables.agent_profiles[0].automations_paused = false;
    db.tables.agent_profiles[0].deactivated_at = new Date().toISOString();
    runOf(r).status = "pending";
    await tick();
    expect(runOf(r).status).toBe("paused");
    expect(sent).toHaveLength(0);
  });

  it("archived and deleted leads are dropped", async () => {
    const wf = workflow([wa("hi")]);
    const a = lead({ archived: true });
    const ra = enroll(wf, a);
    const rb = enroll(wf, { id: "gone" });
    await tick();
    expect(runOf(ra).status).toBe("cancelled");
    expect(runOf(rb).stop_reason).toBe("The lead was deleted");
    expect(sent).toHaveLength(0);
  });

  it("a workflow switched off drops its waiting leads", async () => {
    const wf = workflow([wait(1), wa("never")]);
    const r = enroll(wf, lead());
    await tick();
    wf.published = false;
    timePasses(); await tick();
    expect(runOf(r).status).toBe("cancelled");
    expect(sent).toHaveLength(0);
  });

  it("steps deleted while a lead was waiting: it finishes cleanly", async () => {
    const wf = workflow([tag("a"), wait(1), tag("b"), tag("c")]);
    const l = lead();
    const r = enroll(wf, l);
    await tick();
    wf.definition.steps = [tag("a")] as never; // the rest removed
    timePasses(); await tick();
    expect(runOf(r).status).toBe("completed");
    expect(leadOf(l).tags).toEqual(["a"]);
  });

  it("a check replaced while a lead waited inside it: carries on after it", async () => {
    const wf = workflow([branch("has_email", "", [wait(1), tag("in branch")], []), tag("after")]);
    const l = lead();
    const r = enroll(wf, l);
    await tick();
    expect(runOf(r).pos).toEqual([0, "yes", 1]);
    wf.definition.steps = [tag("replaced"), tag("after")] as never;
    timePasses(); await tick();
    expect(runOf(r).status).toBe("completed");
    expect(leadOf(l).tags).toEqual(["after"]);
  });

  it("a very long run of instant steps carries on next minute", async () => {
    const wf = workflow(Array.from({ length: 40 }, (_, i) => tag(`t${i}`)));
    const l = lead();
    const r = enroll(wf, l);
    await tick();
    expect(runOf(r).status).toBe("pending");
    await tick();
    expect(runOf(r).status).toBe("completed");
    expect(leadOf(l).tags).toHaveLength(40);
  });

  it("the same tag twice (any case) is added once", async () => {
    const wf = workflow([tag("Investor"), tag("investor"), tag("  ")]);
    const l = lead();
    enroll(wf, l);
    await tick();
    expect(leadOf(l).tags).toEqual(["Investor"]);
  });

  it("a reminder for today is due now", async () => {
    const wf = workflow([rem("Call now", 0)]);
    const l = lead();
    enroll(wf, l);
    await tick();
    expect(Math.abs(Date.parse(leadOf(l).reminder_at as string) - Date.now())).toBeLessThan(5000);
  });

  it("a run already taken by another minute isn't run twice", async () => {
    const wf = workflow([wa("once")]);
    const r = enroll(wf, lead());
    runOf(r).status = "processing";
    await tick();
    expect(sent).toHaveLength(0);
  });
});

describe("the weekday summary", () => {
  const today = () => new Date().toISOString();
  it("counts today's new leads and due reminders, and uses the agent's first name", async () => {
    const wf = workflow([wa("Hi {{first_name}}, {{count}} {{leads_word}} to update")], { trigger: { kind: "daily_at", time: "16:00" } });
    lead({ stage: "New Lead", created_at: today() });
    lead({ stage: "No Answer", due: true, reminder_at: new Date(Date.now() - 60_000).toISOString() });
    lead({ stage: "Booked", due: true, reminder_at: new Date(Date.now() - 60_000).toISOString() }); // settled: not counted
    lead({ stage: "New Lead", archived: true, created_at: today() }); // archived: not counted
    enroll(wf, null);
    await tick();
    expect(sent.map((s) => s.text)).toEqual(["Hi Megan, 2 leads to update"]);
  });

  it("a paused account's summary is dropped, not sent late", async () => {
    const wf = workflow([wa("Hi {{first_name}}")], { trigger: { kind: "daily_at", time: "16:00" } });
    lead({ stage: "New Lead", created_at: today() });
    const r = enroll(wf, null);
    db.tables.agent_profiles[0].automations_paused = true;
    await tick();
    expect(runOf(r).status).toBe("cancelled");
    db.tables.agent_profiles[0].automations_paused = false;
    await tick();
    expect(sent).toHaveLength(0);
  });

  it("the end-of-day report: today, the pipeline by stage, and leads never called", async () => {
    const wf = workflow([wa("Hi {{first_name}}\n{{today}}\n{{pipeline}}\n{{not_called}}")], { trigger: { kind: "daily_at", time: "17:00" } });
    const old = new Date(Date.now() - 3 * 86_400_000).toISOString();
    lead({ stage: "New Lead", created_at: today() });
    lead({ stage: "New Lead", created_at: old });
    const called = lead({ stage: "No Answer", created_at: old });
    lead({ stage: "Booked", created_at: old });
    lead({ stage: "Lost", created_at: old }); // closed off: not in the pipeline
    db.tables.lead_events = [{ id: "e1", lead_id: called.id, agent_id: AGENT, actor_id: AGENT, event_type: "call", created_at: today() }];
    enroll(wf, null);
    await tick();
    expect(sent.map((s) => s.text)).toEqual([
      "Hi Megan\nToday: 1 new lead came in and you updated 1 lead.\n• New Lead: 2\n• No Answer: 1\n• Booked: 1\n1 lead hasn't been called yet (the oldest came in 3 days ago). Call them first tomorrow.",
    ]);
  });

  it("the end-of-day report says so when every lead has been called, and skips an empty account", async () => {
    const wf = workflow([wa("{{not_called}}")], { trigger: { kind: "daily_at", time: "17:00" } });
    const r1 = enroll(wf, null);
    await tick();
    expect(sent).toHaveLength(0);
    expect(logOf(r1)).toEqual(["WhatsApp the agent: Skipped"]);
    lead({ stage: "Contacted", created_at: new Date(Date.now() - 86_400_000).toISOString() });
    const wf2 = workflow([wa("{{not_called}}")], { trigger: { kind: "daily_at", time: "17:00" } });
    enroll(wf2, null);
    await tick();
    expect(sent.map((s) => s.text)).toEqual(["Every new lead has been called. Nice work."]);
  });

  it("sends nothing when there's nothing to update", async () => {
    const wf = workflow([wa("Hi {{first_name}}")], { trigger: { kind: "daily_at", time: "16:00" } });
    const r = enroll(wf, null);
    await tick();
    expect(sent).toHaveLength(0);
    expect(logOf(r)).toEqual(["WhatsApp the agent: Skipped"]);
    expect(runOf(r).status).toBe("completed");
  });
});

describe("appointments", () => {
  const appt = { kind: "appointment", amount: 1, unit: "hours", when: "before" };

  it("fills in {{appointment}} in South African time, in WhatsApps and emails", async () => {
    const wf = workflow([wa("{{first_name}} at {{appointment}}"), email("See you {{appointment}}", "Hi {{first_name}}, see you {{appointment}}.")], { trigger: appt });
    const l = lead({ stage: "Booked", appointment_at: "2026-10-07T08:00:00Z" });
    enroll(wf, l);
    await tick();
    expect(sent[0].text).toBe("Thandi at Wed 7 Oct at 10:00");
    expect(emails[0].subject).toBe("See you Wed 7 Oct at 10:00");
  });

  it("a reminder before the appointment ignores quiet hours; one after it doesn't", async () => {
    quiet = new Date(Date.now() + 3 * 3600_000);
    const before = workflow([wa("soon")], { trigger: appt });
    const after = workflow([wa("how did it go")], { trigger: { ...appt, when: "after" } });
    const l = lead({ stage: "Booked", appointment_at: new Date(Date.now() + 3600_000).toISOString() });
    const r1 = enroll(before, l);
    const r2 = enroll(after, l);
    await tick();
    expect(sent.map((s) => s.text)).toEqual(["soon"]);
    expect(runOf(r1).status).toBe("completed");
    expect(runOf(r2).status).toBe("pending");
  });

  it("a Set reminder step never overwrites an appointment still to come", async () => {
    const at = new Date(Date.now() + 86_400_000).toISOString();
    const wf = workflow([rem("Call", 0)], { exits: [] });
    const l = lead({ stage: "Booked", appointment_at: at, reminder_at: at, next_label: "Appt 7 Oct, 10:00" });
    const r = enroll(wf, l);
    await tick();
    expect(leadOf(l).reminder_at).toBe(at);
    expect(leadOf(l).next_label).toBe("Appt 7 Oct, 10:00");
    expect(logOf(r)).toEqual(["Set reminder: Skipped"]);
  });

  it("with no appointment time, {{appointment}} says so", async () => {
    const wf = workflow([wa("At {{appointment}}")], { trigger: appt });
    enroll(wf, lead({ stage: "Booked", appointment_at: null }));
    await tick();
    expect(sent[0].text).toBe("At no time set");
  });
});

describe("confirmation-style emails", () => {
  const body = "Hi {{first_name}},\n\nThanks.\n\n{{lead_magnet}}\n\n{{recent_sales}}\n\nWhatsApp me: {{whatsapp_link}}";
  const send = async (patch: S = {}, pagePatch: S = {}) => {
    Object.assign(db.tables.lead_pages[0], pagePatch);
    const wf = workflow([email("Hello {{first_name}}", body)], { trigger: { kind: "lead_created" }, exits: [] });
    const l = lead({ stage: "New Lead", ...patch });
    const r = enroll(wf, l);
    await tick();
    return { l, r, mail: emails[0] as { html: string; text: string; subject: string } };
  };

  it("a seller form with no setting gets the marketing plan box, and a WhatsApp link", async () => {
    const { l, mail } = await send();
    const token = leadOf(l).plan_token as string;
    expect(token).toMatch(/^[a-f0-9]{32}$/);
    expect(mail.html).toContain("Your marketing plan is ready");
    expect(mail.html).toContain(`https://leads.estatekit.co/plan/${token}`);
    expect(mail.html).toContain("<table role=\"presentation\"");
    expect(mail.text).toContain(`YOUR MARKETING PLAN IS READY`);
    expect(mail.text).toContain(`Open my marketing plan: https://leads.estatekit.co/plan/${token}`);
    expect(mail.text).toContain(`WhatsApp me: https://leads.estatekit.co/w/${l.id}`);
    expect(mail.text).not.toContain("\u0000");
  });

  it("a form's own PDF guide shows with its words", async () => {
    const { mail } = await send({}, { magnet_kind: "pdf", magnet_title: "Your home seller's guide", magnet_text: "Short read.", magnet_button: "Open the guide", magnet_pdf_url: "https://x/y.pdf" });
    expect(mail.html).toContain("Your home seller&#39;s guide");
    expect(mail.html).toContain("Open the guide");
    expect(mail.text).toContain("Short read.");
  });

  it("no lead magnet and no sales: those paragraphs are dropped, not left blank", async () => {
    const { l, mail } = await send({ source_page_id: "pg2", pipeline_id: "pB" });
    expect(mail.html).not.toContain("<table");
    expect(mail.text.split("--")[0].trim()).toBe(`Hi Thandi,\n\nThanks.\n\nWhatsApp me: https://leads.estatekit.co/w/${l.id}`);
    expect(mail.html).not.toContain("<p style=\"margin:0 0 14px\"></p>");
  });

  it("{{recent_sales}} lists the agent's latest sales with a link to them all", async () => {
    db.tables.sold_listings = [
      { agent_id: AGENT, address: "14 Oak Avenue", price: 2150000, status: "sold", sort_order: 0 },
      { agent_id: AGENT, address: "3 Elm Road", price: 1800000, status: "listed", sort_order: 1 },
      { agent_id: "other", address: "Not mine", price: 1, status: "sold", sort_order: 0 },
    ];
    const { mail } = await send({ source_page_id: "pg2" });
    expect(mail.text).toContain("- 14 Oak Avenue: sold for R2 150 000");
    expect(mail.text).toContain("- 3 Elm Road: listed at R1 800 000");
    expect(mail.text).not.toContain("Not mine");
    expect(mail.text).toContain(`See them all: https://leads.estatekit.co/sold/${AGENT}`);
  });

  it("keeps the email service's id, so delivery reports match", async () => {
    const { r } = await send();
    const rec = db.rows("workflow_emails").find((e) => e.run_id === r.id)!;
    expect(rec.resend_id).toBe("re_1");
  });
});

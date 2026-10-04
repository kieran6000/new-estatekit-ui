import { describe, expect, it } from "vitest";
import standard from "../../scripts/e2e-standard-workflows.json";
import {
  TEMPLATES, TRIGGERS, STEP_TYPES, BRANCH_CHECKS, FILTER_FIELDS,
  allowedSteps, blankWorkflow, cloneSteps, countSteps, defaultBranchValue, findStep,
  insertStep, locate, moveStep, newStep, ordinal, problemCount, removeStep, stepAtPos, stepSummary,
  timeLabel, timeline, triggerOfKind, triggerSummary, unitLabel, updateStep, validate,
  type Branch, type Path, type Step, type Workflow,
} from "./workflow";

const wa = (text = "Call {{first_name}}: {{action_link}}"): Step => ({ ...newStep("whatsapp_agent"), text } as Step);
const email = (): Step => ({ ...newStep("email_lead"), subject: "Hi {{first_name}}", body: "Hello from {{agent_name}}" } as Step);
const wait = (amount = 1, unit: "minutes" | "hours" | "days" = "days"): Step => ({ ...newStep("wait"), amount, unit } as Step);
const branch = (yes: Step[] = [], no: Step[] = [], check: Branch["check"] = "has_email"): Branch =>
  ({ ...newStep("branch"), check, value: defaultBranchValue(check), yes, no } as Branch);
const wf = (steps: Step[], patch: Partial<Workflow> = {}): Workflow => ({ ...blankWorkflow(), steps, ...patch });
const ids = (steps: Step[]): string[] => steps.flatMap((s) => [s.id, ...(s.type === "branch" ? [...ids(s.yes), ...ids(s.no)] : [])]);

describe("tree edits", () => {
  it("inserts at the start, middle and end of the main path", () => {
    const a = wa("a"), b = wa("b"), x = wa("x");
    expect(insertStep([a, b], "root", 0, x).map((s) => s.id)).toEqual([x.id, a.id, b.id]);
    expect(insertStep([a, b], "root", 1, x).map((s) => s.id)).toEqual([a.id, x.id, b.id]);
    expect(insertStep([a, b], "root", 2, x).map((s) => s.id)).toEqual([a.id, b.id, x.id]);
  });

  it("clamps out-of-range positions instead of losing the step", () => {
    const a = wa(), x = wa();
    expect(insertStep([a], "root", 99, x).map((s) => s.id)).toEqual([a.id, x.id]);
    expect(insertStep([a], "root", -5, x).map((s) => s.id)).toEqual([x.id, a.id]);
  });

  it("inserts into either path of a branch, at any position, at any depth", () => {
    const inner = branch([wa("i1")], []);
    const outer = branch([inner], [wa("o-no")]);
    let steps: Step[] = [outer];
    const x = wa("x"), y = wa("y"), z = wa("z");
    steps = insertStep(steps, `${outer.id}:no`, 0, x);
    steps = insertStep(steps, `${inner.id}:yes`, 1, y);
    steps = insertStep(steps, `${inner.id}:no`, 0, z);
    const o = steps[0] as Branch;
    expect(o.no.map((s) => s.id)).toEqual([x.id, outer.no[0].id]);
    const i = o.yes[0] as Branch;
    expect(i.yes.map((s) => s.id)).toEqual([inner.yes[0].id, y.id]);
    expect(i.no.map((s) => s.id)).toEqual([z.id]);
    expect(countSteps(steps)).toBe(7);
  });

  it("doesn't change the original tree (undo depends on it)", () => {
    const b = branch([wa()], []);
    const before = JSON.stringify([b]);
    insertStep([b], `${b.id}:yes`, 0, wa());
    removeStep([b], b.yes[0].id);
    updateStep([b], b.id, { check: "stage_is" });
    moveStep([b, wa()], b.id, 1);
    expect(JSON.stringify([b])).toBe(before);
  });

  it("removes a step anywhere, and a branch with everything under it", () => {
    const deep = wa("deep");
    const inner = branch([deep], [wa()]);
    const outer = branch([inner], [wa()]);
    const after = wa("after");
    const steps = [outer, after];
    expect(findStep(removeStep(steps, deep.id), deep.id)).toBeUndefined();
    expect(countSteps(removeStep(steps, deep.id))).toBe(countSteps(steps) - 1);
    const noOuter = removeStep(steps, outer.id);
    expect(noOuter.map((s) => s.id)).toEqual([after.id]);
    expect(removeStep(steps, "nope")).toEqual(steps);
  });

  it("updates fields but never the id or type", () => {
    const a = wa("old");
    const out = updateStep([a], a.id, { text: "new", id: "hacked", type: "tag" } as Partial<Step>);
    expect(out[0]).toMatchObject({ id: a.id, type: "whatsapp_agent", text: "new" });
  });

  it("moves steps up and down within their own list, and stops at the ends", () => {
    const a = wa("a"), b = wa("b"), c = wa("c");
    expect(moveStep([a, b, c], b.id, -1).map((s) => s.id)).toEqual([b.id, a.id, c.id]);
    expect(moveStep([a, b, c], b.id, 1).map((s) => s.id)).toEqual([a.id, c.id, b.id]);
    expect(moveStep([a, b, c], a.id, -1).map((s) => s.id)).toEqual([a.id, b.id, c.id]);
    expect(moveStep([a, b, c], c.id, 1).map((s) => s.id)).toEqual([a.id, b.id, c.id]);
    const br = branch([a, b], []);
    const moved = moveStep([br], b.id, -1)[0] as Branch;
    expect(moved.yes.map((s) => s.id)).toEqual([b.id, a.id]);
  });

  it("locates a step's list and position", () => {
    const a = wa(), b = wa();
    const br = branch([a], [b]);
    expect(locate([wa(), br], br.id)).toEqual({ path: "root", index: 1, length: 2 });
    expect(locate([br], b.id)).toEqual({ path: `${br.id}:no`, index: 0, length: 1 });
    expect(locate([br], "nope")).toBeNull();
  });

  it("clones with all-new ids", () => {
    const steps = [branch([wa(), branch([wa()], [])], [wa()])];
    const copy = cloneSteps(steps);
    expect(countSteps(copy)).toBe(countSteps(steps));
    const all = new Set([...ids(steps), ...ids(copy)]);
    expect(all.size).toBe(ids(steps).length * 2);
  });

  it("survives 500 random adds, deletes and moves with unique ids and a consistent count", () => {
    let steps: Step[] = [];
    let seed = 7;
    const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed % n; };
    const paths = (list: Step[]): Path[] => list.flatMap((s) => (s.type === "branch" ? [`${s.id}:yes` as Path, `${s.id}:no` as Path, ...paths(s.yes), ...paths(s.no)] : []));
    for (let i = 0; i < 500; i++) {
      const all = ids(steps);
      const op = rnd(3);
      if (op === 0 || !all.length) {
        const ps: Path[] = ["root", ...paths(steps)];
        const path = ps[rnd(ps.length)];
        const before = countSteps(steps);
        const type = STEP_TYPES[rnd(STEP_TYPES.length)].type;
        steps = insertStep(steps, path, rnd(4), newStep(type));
        expect(countSteps(steps)).toBe(before + 1);
      } else if (op === 1) {
        const id = all[rnd(all.length)];
        const target = findStep(steps, id)!;
        const gone = 1 + (target.type === "branch" ? countSteps(target.yes) + countSteps(target.no) : 0);
        const before = countSteps(steps);
        steps = removeStep(steps, id);
        expect(countSteps(steps)).toBe(before - gone);
      } else {
        const before = countSteps(steps);
        steps = moveStep(steps, all[rnd(all.length)], rnd(2) ? 1 : -1);
        expect(countSteps(steps)).toBe(before);
      }
      const now = ids(steps);
      expect(new Set(now).size).toBe(now.length);
    }
  });
});

describe("checks", () => {
  it("a blank workflow can't go on: it does nothing", () => {
    const p = validate(blankWorkflow());
    expect(p.workflow?.[0]).toMatch(/does something/);
  });

  it("every template, every standard workflow and a simple workflow are clean", () => {
    for (const t of TEMPLATES.filter((t) => t.name !== "Blank workflow")) expect(validate(t.make()), t.name).toEqual({});
    // The real standard set every account has (scripts/e2e-standard-workflows.json mirrors the database).
    for (const t of standard) expect(validate({ ...blankWorkflow(), name: t.name, ...t.definition } as Workflow), t.name).toEqual({});
    expect(validate(wf([wa()]))).toEqual({});
  });

  it("every trigger starts out valid when picked", () => {
    for (const t of TRIGGERS) {
      const trig = triggerOfKind(t.kind);
      expect(validate(wf([wa()], { trigger: trig })).trigger, t.kind).toBeUndefined();
      expect(triggerSummary(trig)).not.toMatch(/…|undefined/);
    }
  });

  it("flags bad trigger values", () => {
    expect(validate(wf([wa()], { trigger: { kind: "stage_changed" } })).trigger).toBeDefined();
    expect(validate(wf([wa()], { trigger: { kind: "no_answer_times", count: 0 } })).trigger).toBeDefined();
    expect(validate(wf([wa()], { trigger: { kind: "no_answer_times", count: 1.5 } })).trigger).toBeDefined();
    expect(validate(wf([wa()], { trigger: { kind: "not_contacted_for", days: NaN } })).trigger).toBeDefined();
    expect(validate(wf([wa()], { trigger: { kind: "daily_at", time: "" } })).trigger).toBeDefined();
  });

  it("flags every empty step, on the step itself", () => {
    for (const t of STEP_TYPES) {
      const s = newStep(t.type);
      const p = validate(wf([wa(), s, wa()]));
      if (t.type === "wait" || t.type === "set_stage" || t.type === "reminder") expect(p[s.id], t.type).toBeUndefined();
      else expect(p[s.id], t.type).toBeDefined();
    }
  });

  it("flags waits that are zero, fractional, too short, or last", () => {
    expect(validate(wf([wait(0), wa()]))).not.toEqual({});
    expect(validate(wf([wait(1.5), wa()]))).not.toEqual({});
    expect(validate(wf([wait(2, "minutes"), wa()]))).not.toEqual({});
    const last = wait();
    expect(validate(wf([wa(), last]))[last.id]?.[0]).toMatch(/Nothing happens after/);
    expect(validate(wf([wait(5, "minutes"), wa()]))).toEqual({});
  });

  it("checks merge fields per message type", () => {
    const e = { ...email(), body: "Call me {{action_link}}" } as Step;
    expect(validate(wf([e]))[e.id]?.join()).toMatch(/agent's call link/);
    // The lead's details and every form answer can go in a WhatsApp to the agent.
    expect(validate(wf([wa("{{phone}} {{email}} {{address}} {{form}}\n{{answers}}")]))).toEqual({});
    const w = { ...email(), body: "Answers: {{answers}}" } as Step;
    expect(validate(wf([w]))[w.id]?.join()).toMatch(/isn't a field/);
    const u = wa("Hi {{frist_name}}");
    expect(validate(wf([u]))[u.id]?.join()).toMatch(/isn't a field/);
    expect(validate(wf([wa("Hi {{ first_name }}")]))).toEqual({});
  });

  it("'opened the last email' needs an email before it on every path", () => {
    const check = branch([wa()], [], "opened_last_email");
    expect(validate(wf([check]))[check.id]?.join()).toMatch(/no email before/);
    expect(validate(wf([email(), wait(), check]))[check.id]).toBeUndefined();
    const onlyYes = branch([email()], [wa()]);
    const after1 = branch([wa()], [], "opened_last_email");
    expect(validate(wf([onlyYes, wait(), after1]))[after1.id]).toBeDefined();
    const both = branch([email()], [email()]);
    const after2 = branch([wa()], [], "opened_last_email");
    expect(validate(wf([both, wait(), after2]))[after2.id]).toBeUndefined();
    const inside = branch([email(), wait(), branch([wa()], [], "opened_last_email")], []);
    expect(problemCount(validate(wf([inside])))).toBe(0);
  });

  it("flags a check with nothing under either path, and checks missing a value", () => {
    const empty = branch([], []);
    expect(validate(wf([wa(), empty]))[empty.id]).toBeDefined();
    for (const c of BRANCH_CHECKS.filter((x) => x.needsValue)) {
      const b = { ...branch([wa()], [], c.check), value: "" } as Step;
      expect(validate(wf([b]))[b.id], c.check).toBeDefined();
    }
  });

  it("a daily summary can only wait and WhatsApp the agent", () => {
    expect(allowedSteps({ kind: "daily_at" })).toEqual(["wait", "whatsapp_agent"]);
    const e = email();
    expect(validate(wf([e], { trigger: { kind: "daily_at", time: "16:00" } }))[e.id]?.join()).toMatch(/isn't about one lead/);
  });

  it("flags duplicate and empty filters", () => {
    expect(validate(wf([wa()], { filters: [{ field: "stage", value: "Contacted" }, { field: "stage", value: "Booked" }] })).filters).toBeDefined();
    expect(validate(wf([wa()], { filters: [{ field: "stage", value: "" }] })).filters).toBeDefined();
    for (const f of FILTER_FIELDS) expect(validate(wf([wa()], { filters: [{ field: f.field, value: f.options()[0].v }] })).filters, f.field).toBeUndefined();
  });

  it("flags moving a lead to the stage the trigger just moved them to", () => {
    const s = { ...newStep("set_stage"), stage: "Booked" } as Step;
    expect(validate(wf([s], { trigger: { kind: "stage_changed", stage: "Booked" } }))[s.id]).toBeDefined();
  });

  it("flags a missing name", () => {
    expect(validate(wf([wa()], { name: "  " })).workflow).toBeDefined();
  });
});

describe("daily summary", () => {
  it("the real daily summary's fields pass, and lead fields in it don't", () => {
    const text = "Hi {{first_name}}, hope you're well.\n\nYou have {{count}} {{leads_word}} that still need updating.\n\nTap here to update them: https://leads.estatekit.co/leads";
    expect(validate(wf([wa(text)], { trigger: { kind: "daily_at", time: "16:00" } }))).toEqual({});
    const bad = wa("{{name}} needs a call: {{action_link}}");
    expect(validate(wf([bad], { trigger: { kind: "daily_at", time: "16:00" } }))[bad.id]?.join()).toMatch(/daily summary/);
    expect(validate(wf([wa("You have {{count}} leads")]))).not.toEqual({});
  });
});

describe("words", () => {
  it("reads naturally", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101, 111].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "101st", "111th"]);
    expect(unitLabel(1, "days")).toBe("1 day");
    expect(unitLabel(3, "hours")).toBe("3 hours");
    expect([0, 30, 90, 1440, 2160].map(timeLabel)).toEqual(["Straight away", "+30 min", "+1.5 h", "Day 1", "Day 1.5"]);
    for (const t of STEP_TYPES) expect(stepSummary(newStep(t.type))).not.toMatch(/undefined/);
  });

  it("lays out the main path in time", () => {
    const w = wf([wa(), wait(30, "minutes"), email(), wait(2), branch([wa()], [])]);
    expect(timeline(w).map((r) => r.atMinutes)).toEqual([0, 30, 30 + 2880]);
  });
});

describe("appointment trigger", () => {
  it("defaults to 1 day before and reads in words", () => {
    const t = triggerOfKind("appointment");
    expect(t).toEqual({ kind: "appointment", amount: 1, unit: "days", when: "before" });
    expect(triggerSummary({ ...t, amount: 30, unit: "minutes" })).toBe("30 minutes before the appointment");
    expect(triggerSummary({ ...t, amount: 2, unit: "hours", when: "after" })).toBe("2 hours after the appointment");
  });
  it("checks the amount, and allows {{appointment}} in WhatsApps and emails", () => {
    const wf = { ...blankWorkflow(), trigger: { kind: "appointment" as const, amount: 2, unit: "minutes" as const, when: "before" as const },
      steps: [{ id: "a", type: "whatsapp_agent" as const, text: "{{name}} at {{appointment}}" }, { id: "b", type: "email_lead" as const, subject: "See you {{appointment}}", body: "Hi" }] };
    const p = validate(wf);
    expect(p.trigger).toEqual(["At least 5 minutes: messages go out once a minute."]);
    expect(p.a).toBeUndefined();
    expect(p.b).toBeUndefined();
  });
  it("the appointment templates are valid as they come", () => {
    for (const t of TEMPLATES.filter((x) => /ppointment/.test(x.name))) expect(validate(t.make())).toEqual({});
  });
});

describe("where a lead is (stepAtPos)", () => {
  const a = wa(), b = email(), c = wa(), d = email();
  const br = branch([b], [c]);
  const steps = [a, br, d];
  it("reads top-level and branch positions", () => {
    expect(stepAtPos(steps, [0])?.id).toBe(a.id);
    expect(stepAtPos(steps, [1, "yes", 0])?.id).toBe(b.id);
    expect(stepAtPos(steps, [1, "no", 0])?.id).toBe(c.id);
  });
  it("past the end of a path carries on after the check, like the engine", () => {
    expect(stepAtPos(steps, [1, "yes", 1])?.id).toBe(d.id);
    expect(stepAtPos(steps, [3])).toBeUndefined();
  });
  it("an empty or missing position is the first step", () => {
    expect(stepAtPos(steps, [])?.id).toBe(a.id);
    expect(stepAtPos(steps, null)?.id).toBe(a.id);
  });
});

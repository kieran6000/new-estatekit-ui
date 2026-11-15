// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("../api/_client", () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }));

import { flushLeadOutbox, submitLead, type LeadSubmission } from "./leadOutbox";

const body: LeadSubmission = {
  pageId: "p1", name: "Thandi Mokoena", phone: "082 123 4567", formAnswers: [{ q: "When?", a: "Soon" }],
  email: null, attribution: {}, quality: "good", planToken: null,
};
const ok = (id = "lead-1") => ({ data: { id }, error: null });
const offline = () => ({ data: null, error: Object.assign(new Error("Failed to send a request"), { name: "FunctionsFetchError" }) });
const http = (status: number) => ({ data: null, error: Object.assign(new Error("non-2xx"), { name: "FunctionsHttpError", context: { status } }) });
const kept = () => JSON.parse(localStorage.getItem("ek-lead-outbox") || "[]") as { at: number }[];

beforeEach(() => {
  vi.useFakeTimers();
  invoke.mockReset();
  localStorage.clear();
});
afterEach(() => vi.useRealTimers());

describe("submitLead", () => {
  it("saves first time and keeps nothing", async () => {
    invoke.mockResolvedValueOnce(ok());
    await expect(submitLead(body)).resolves.toEqual({ id: "lead-1" });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("public-submit-lead", { body });
    expect(kept()).toEqual([]);
  });

  it("tries again after no signal or a server hiccup, then saves", async () => {
    invoke.mockResolvedValueOnce(offline()).mockResolvedValueOnce(http(503)).mockResolvedValueOnce(ok("lead-2"));
    const p = submitLead(body);
    await vi.runAllTimersAsync();
    await expect(p).resolves.toEqual({ id: "lead-2" });
    expect(invoke).toHaveBeenCalledTimes(3);
    expect(kept()).toEqual([]);
  });

  it("doesn't retry what the server refused (a bad request)", async () => {
    invoke.mockResolvedValueOnce(http(400));
    const p = submitLead(body);
    const done = expect(p).rejects.toThrow();
    await vi.runAllTimersAsync();
    await done;
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(kept()).toEqual([]);
  });

  it("keeps the form when every try fails, and sends it once the signal is back", async () => {
    invoke.mockResolvedValue(offline());
    const p = submitLead(body);
    const done = expect(p).rejects.toThrow();
    await vi.runAllTimersAsync();
    await done;
    expect(invoke).toHaveBeenCalledTimes(4);
    expect(kept()).toHaveLength(1);

    invoke.mockReset();
    invoke.mockResolvedValueOnce(ok("lead-3"));
    flushLeadOutbox();
    await vi.runAllTimersAsync();
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(kept()).toEqual([]);
  });

  it("gives up on a form older than a day", async () => {
    localStorage.setItem("ek-lead-outbox", JSON.stringify([{ id: "old", at: Date.now() - 25 * 3600_000, body }]));
    flushLeadOutbox();
    await vi.runAllTimersAsync();
    expect(invoke).not.toHaveBeenCalled();
    expect(kept()).toEqual([]);
  });

  it("never sends the same form twice at once", async () => {
    invoke.mockResolvedValueOnce(offline()).mockResolvedValueOnce(ok());
    const p = submitLead(body);
    flushLeadOutbox(); // e.g. the thank-you page opening while the first try is out
    flushLeadOutbox();
    await vi.runAllTimersAsync();
    await expect(p).resolves.toEqual({ id: "lead-1" });
    expect(invoke).toHaveBeenCalledTimes(2);
  });
});

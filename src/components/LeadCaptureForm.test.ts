import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DisqualifiedScreen, formProgress } from "./LeadCaptureForm";
import type { CustomQuestion, LeadPage } from "../types";

describe("end page when an answer turns them away", () => {
  const page = {
    agentName: "Ansunette Ferreira", accentColor: "#0086ff",
    dqHeadline: "", dqText: "It sounds like now is not the right time to sell.", dqCtaLabel: "", dqCtaUrl: "",
  } as LeadPage;
  const owner = (helperText?: string) => ({
    id: "q", pageId: "p", label: "Are you the owner of this property?", type: "multiple_choice",
    options: ["Yes", "No"], disqualifyAnswers: ["No"], required: true, isDefault: false, order: 1, helperText,
  }) as CustomQuestion;
  const words = (question: CustomQuestion, p: LeadPage = page) =>
    renderToString(createElement(DisqualifiedScreen, { page: p, question })).replace(/<[^>]+>/g, " ");

  it("gives the question's own reason, with the agent's first name", () => {
    const t = words(owner("By law (POPIA), {agent} can only discuss a property with its owner."));
    expect(t).toContain("By law (POPIA), Ansunette can only discuss a property with its owner.");
    expect(t).not.toContain("right time to sell");
  });

  it("otherwise the page's message, then ours, as before", () => {
    expect(words(owner())).toContain("now is not the right time to sell");
    expect(words(owner("   "), { ...page, dqText: "" })).toContain("this might not be the right time");
  });
});

describe("progress bar", () => {
  it("starts part-way full and keeps moving to the end, never full before they finish", () => {
    expect([0, 1, 2, 3].map((s) => formProgress(s, 4))).toEqual([42, 68, 86, 96]);
    expect(formProgress(0, 10)).toBe(26); // a long form still feels started
    expect(formProgress(0, 1)).toBe(78);
  });
});

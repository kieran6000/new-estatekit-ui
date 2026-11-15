import { describe, expect, it } from "vitest";
import { formProgress } from "./LeadCaptureForm";

describe("progress bar", () => {
  it("starts part-way full and keeps moving to the end, never full before they finish", () => {
    expect([0, 1, 2, 3].map((s) => formProgress(s, 4))).toEqual([42, 68, 86, 96]);
    expect(formProgress(0, 10)).toBe(26); // a long form still feels started
    expect(formProgress(0, 1)).toBe(78);
  });
});

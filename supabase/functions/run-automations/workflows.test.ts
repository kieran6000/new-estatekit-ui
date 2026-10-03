import { describe, expect, it } from "vitest";
import { next, settle, stepAt } from "./workflows";

// Walking the step tree: the engine's only tricky bit.
const tree = [
  { id: "a", type: "wait", amount: 1, unit: "days" },
  {
    id: "b", type: "branch", check: "has_email", value: "",
    yes: [{ id: "y1", type: "tag", tag: "x" }, { id: "y2", type: "tag", tag: "y" }],
    no: [],
  },
  { id: "c", type: "tag", tag: "z" },
] as never;

describe("workflow positions", () => {
  it("finds steps on the main path and inside a branch", () => {
    expect(stepAt(tree, [0])?.id).toBe("a");
    expect(stepAt(tree, [1, "yes", 1])?.id).toBe("y2");
    expect(stepAt(tree, [1, "no", 0])).toBeUndefined();
    expect(stepAt(tree, [9])).toBeUndefined();
  });

  it("steps out of a finished branch to the next main step", () => {
    expect(settle(tree, next([1, "yes", 1]))).toEqual([2]);
    expect(settle(tree, [1, "no", 0])).toEqual([2]);
  });

  it("is finished after the last main step", () => {
    expect(settle(tree, next([2]))).toBeNull();
    expect(settle([] as never, [0])).toBeNull();
  });

  it("copes with a workflow edited under a waiting lead", () => {
    // The position points into a step that's no longer a branch.
    expect(settle(tree, [0, "yes", 0])).toEqual([1]);
  });
});

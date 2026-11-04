import { describe, expect, it } from "vitest";
import { telHref } from "./format";

describe("dialling a lead", () => {
  it("always gives the phone a full number with a +", () => {
    for (const typed of ["082 668 5452", "0826685452", "27826685452", "+27826685452", "+27 082 668 5452", "82 668 5452", " 0826685452 "]) {
      expect(telHref(typed)).toBe("tel:+27826685452");
    }
  });
  it("leaves numbers from other countries alone", () => {
    expect(telHref("+264 85 287 8236")).toBe("tel:+264852878236");
  });
});

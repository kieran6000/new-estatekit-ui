import { describe, expect, it } from "vitest";
import { buildBrief, cityFromAddress } from "./brief";

describe("a client's city when nobody wrote it down", () => {
  it("takes the town from their business address", () => {
    expect(cityFromAddress("1057 Frederik Avenue, Eldoraigne, Centurion")).toBe("Centurion");
    expect(cityFromAddress("40 Evander Street, Wierda Park, Centurion, 0157, Gauteng, South Africa")).toBe("Centurion");
    expect(cityFromAddress("12 Main Road")).toBe("");
  });

  it("falls back to their area, and marks it as worked out", () => {
    const brief = buildBrief({ signup: null, onboarding: [], targetAreas: [], company: null, area: "Boksburg, East Rand" });
    expect(brief.city).toEqual({ value: "Boksburg", source: "guess" });
  });

  it("never replaces a city someone wrote down", () => {
    const brief = buildBrief({ signup: null, onboarding: [{ q: "City or town", a: "Pretoria" }], targetAreas: [], company: null, area: "Boksburg" });
    expect(brief.city?.value).toBe("Pretoria");
  });
});

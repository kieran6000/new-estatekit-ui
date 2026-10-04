import { describe, expect, it } from "vitest";
import { MAGNET_PRESETS, presetKeyOf, resolveMagnet } from "./leadMagnet";

describe("lead magnets", () => {
  it("not set: the marketing plan on seller forms, nothing on others (as before)", () => {
    expect(resolveMagnet({}, "seller").kind).toBe("plan");
    expect(resolveMagnet({}, "buyer").kind).toBe("none");
    expect(resolveMagnet({ magnetKind: null }, "general").kind).toBe("none");
  });

  it("a PDF without its file gives nothing; with it, the PDF", () => {
    expect(resolveMagnet({ magnetKind: "pdf" }, "seller").kind).toBe("none");
    const m = resolveMagnet({ magnetKind: "pdf", magnetPdfUrl: "https://x/y.pdf" }, "buyer");
    expect(m).toMatchObject({ kind: "pdf", pdfUrl: "https://x/y.pdf", title: "Your free guide", button: "Open it" });
  });

  it("blank words fall back to the preset's; typed words win", () => {
    expect(resolveMagnet({ magnetKind: "plan", magnetTitle: "  " }, "seller").title).toBe("Your marketing plan is ready");
    expect(resolveMagnet({ magnetKind: "plan", magnetTitle: "Your plan", magnetButton: "Go" }, "seller")).toMatchObject({ title: "Your plan", button: "Go" });
  });

  it("switching it off sticks, even on a seller form", () => {
    expect(resolveMagnet({ magnetKind: "none" }, "seller").kind).toBe("none");
  });

  it("the picker finds the preset that was saved", () => {
    for (const p of MAGNET_PRESETS.filter((x) => x.kind === "pdf")) {
      expect(presetKeyOf({ magnetKind: "pdf", magnetTitle: p.title, magnetPdfUrl: "https://x" }, "seller")).toBe(p.key);
    }
    expect(presetKeyOf({ magnetKind: "pdf", magnetTitle: "My own", magnetPdfUrl: "https://x" }, "seller")).toBe("pdf");
    expect(presetKeyOf({}, "seller")).toBe("plan");
    expect(presetKeyOf({}, "buyer")).toBe("none");
  });
});

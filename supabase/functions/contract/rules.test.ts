import { describe, expect, it } from "vitest";
import { canonical, cleanScroll, cleanSeconds, codeRefusal, documentHash, firstIp, maskPhone, newCode, phoneDigits, validSignature, validSignerName } from "./rules";

describe("a contract's fingerprint", () => {
  it("is the same when the database reorders the keys", async () => {
    expect(await documentHash({ b: [{ y: 1, x: 2 }], a: "z" })).toBe(await documentHash({ a: "z", b: [{ x: 2, y: 1 }] }));
    expect(canonical({ b: 1, a: null })).toBe('{"a":null,"b":1}');
  });

  it("changes when one word changes", async () => {
    expect(await documentHash({ a: "pay R100" })).not.toBe(await documentHash({ a: "pay R900" }));
  });
});

describe("the signer's number", () => {
  it("reads every usual way of writing it", () => {
    expect(phoneDigits("083 355 3136")).toBe("27833553136");
    expect(phoneDigits("+27 83 355 3136")).toBe("27833553136");
    expect(phoneDigits("270833553136")).toBe("27833553136");
    expect(phoneDigits("+264852878236")).toBe("264852878236");
  });

  it("refuses what can't be a number", () => {
    expect(phoneDigits("")).toBe("");
    expect(phoneDigits("12345")).toBe("");
  });

  it("only ever shows the last four digits", () => {
    expect(maskPhone("27833553136")).toBe("•••• 3136");
  });
});

describe("what a signature needs", () => {
  it("takes a drawn signature and nothing else", () => {
    expect(validSignature("data:image/png;base64,iVBORw0KGgo=")).toBe(true);
    expect(validSignature("data:text/html;base64,PHNjcmlwdD4=")).toBe(false);
    expect(validSignature(`data:image/png;base64,${"A".repeat(500_001)}`)).toBe(false);
    expect(validSignature(null)).toBe(false);
  });

  it("wants a full name", () => {
    expect(validSignerName("Siva Naidoo")).toBe(true);
    expect(validSignerName("Élise  van der Merwe")).toBe(true);
    expect(validSignerName("Siva")).toBe(false);
    expect(validSignerName("12 34")).toBe(false);
  });
});

describe("sending signing codes", () => {
  const now = Date.parse("2026-11-03T10:00:00Z");
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it("allows the first code", () => {
    expect(codeRefusal([], now)).toBeNull();
  });

  it("waits 30 seconds between codes", () => {
    expect(codeRefusal([ago(10_000)], now)).toMatch(/30 seconds/);
    expect(codeRefusal([ago(31_000)], now)).toBeNull();
  });

  it("stops at five an hour, then allows more once they've aged out", () => {
    const five = [1, 2, 3, 4, 5].map((m) => ago(m * 60_000));
    expect(codeRefusal(five, now)).toMatch(/an hour/);
    expect(codeRefusal(five.map(() => ago(3_700_000)), now)).toBeNull();
  });

  it("codes are always six digits", () => {
    for (let i = 0; i < 200; i++) expect(newCode()).toMatch(/^\d{6}$/);
  });
});

describe("reading reports from the page", () => {
  it("can't claim more time than a report covers, or nonsense", () => {
    expect(cleanSeconds(15)).toBe(15);
    expect(cleanSeconds(99999)).toBe(60);
    expect(cleanSeconds(-4)).toBe(0);
    expect(cleanSeconds("x")).toBe(0);
    expect(cleanScroll(140)).toBe(100);
  });

  it("takes the visitor's address, not the proxies'", () => {
    expect(firstIp("41.1.2.3, 10.0.0.1")).toBe("41.1.2.3");
    expect(firstIp(null)).toBeNull();
  });
});

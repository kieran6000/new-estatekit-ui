import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ALWAYS_LIGHT } from "./themeMode";

describe("always-light pages", () => {
  // index.html sets light/dark before the app loads (no white flash), with its
  // own copy of this list. When the two drift apart, a public page opened by
  // an agent in dark mode flashes dark or renders dark text on its white cards.
  it("index.html's first-paint script uses the same list", () => {
    const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
    expect(html).toContain(`/${ALWAYS_LIGHT.source}/`);
  });

  it("covers every public page", () => {
    for (const p of ["/p/x", "/r/x", "/c/x", "/i/x", "/k/x", "/call/x", "/call/sample/x", "/contract/x", "/thank-you", "/privacy", "/start", "/sold/x", "/plan/x", "/report/x", "/unsubscribe/x/y"]) {
      expect(ALWAYS_LIGHT.test(p), p).toBe(true);
    }
    for (const p of ["/leads", "/calendar", "/clients", "/account", "/lead-page", "/l/x"]) {
      expect(ALWAYS_LIGHT.test(p), p).toBe(false);
    }
  });
});

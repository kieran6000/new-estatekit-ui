import { describe, expect, it } from "vitest";
import { clientPath, clientSlug, resolveClient, slugify } from "./clientSlug";

const all = [
  { agent_id: "d5bd1eea-d3d5-4daa-9e15-ab3c621192eb", display_name: "Bennie Bell" },
  { agent_id: "0eba9b17-2e1a-4bc9-91bc-096e33cf39e1", display_name: "Naudé Kritzinger" },
  { agent_id: "11111111-1111-4111-8111-111111111111", display_name: "Sam Smith" },
  { agent_id: "22222222-2222-4222-8222-222222222222", display_name: "Sam Smith" },
];

describe("client page addresses", () => {
  it("makes readable slugs, accents and all", () => {
    expect(slugify("Bennie Bell")).toBe("bennie-bell");
    expect(slugify("Naudé Kritzinger")).toBe("naude-kritzinger");
    expect(slugify("GIVEN HLAKISI")).toBe("given-hlakisi");
    expect(slugify("")).toBe("client");
  });

  it("keeps two people with the same name apart", () => {
    expect(clientSlug(all[2], all)).toBe("sam-smith-1111");
    expect(clientSlug(all[3], all)).toBe("sam-smith-2222");
  });

  it("finds the client from the slug, or an old id address", () => {
    expect(resolveClient("bennie-bell", all)).toBe(all[0].agent_id);
    expect(resolveClient("naude-kritzinger", all)).toBe(all[1].agent_id);
    expect(resolveClient(all[0].agent_id, all)).toBe(all[0].agent_id);
    expect(resolveClient("nobody", all)).toBeNull();
  });

  it("builds the path, with the id while names load", () => {
    expect(clientPath(all[0].agent_id, all, "settings")).toBe("/clients/bennie-bell/settings");
    expect(clientPath(all[0].agent_id, undefined)).toBe(`/clients/${all[0].agent_id}/overview`);
  });
});

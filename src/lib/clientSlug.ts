// Client pages have readable addresses: /clients/bennie-bell/overview, not
// /admin/clients/d5bd1eea-…. The name makes the slug; two clients with the
// same name get the start of their id added so each address stays unique.
// Old addresses with the id still work (they're sent on to the slug).

export interface Sluggable { agent_id: string; display_name: string | null }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isAgentId = (s: string) => UUID.test(s);

export function slugify(name: string | null | undefined): string {
  return (name || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // Naudé -> naude
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "client";
}

/** This client's slug among everyone's (unique). */
export function clientSlug(p: Sluggable, all: Sluggable[]): string {
  const base = slugify(p.display_name);
  const twins = all.filter((x) => slugify(x.display_name) === base);
  return twins.length > 1 ? `${base}-${p.agent_id.slice(0, 4)}` : base;
}

/** Who an address means: an id as is, else the client whose slug it is. */
export function resolveClient(who: string, all: Sluggable[]): string | null {
  if (isAgentId(who)) return who;
  return all.find((p) => clientSlug(p, all) === who)?.agent_id ?? null;
}

export type ClientTab = "overview" | "brief" | "contract" | "settings";
export const CLIENT_TABS: ClientTab[] = ["overview", "brief", "contract", "settings"];

/** /clients/<slug>/<tab>, falling back to the id while names are loading. */
export function clientPath(agentId: string, all: Sluggable[] | undefined, tab: ClientTab = "overview"): string {
  const p = all?.find((x) => x.agent_id === agentId);
  return `/clients/${p ? clientSlug(p, all!) : agentId}/${tab}`;
}

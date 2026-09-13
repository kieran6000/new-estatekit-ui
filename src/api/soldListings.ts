import { supabase, getActiveAgentId } from "./_client";

export type SoldListingStatus = "sold" | "listed";

export interface SoldListing {
  id: string;
  agentId: string;
  imageUrl: string | null;
  address: string;
  price: number | null;
  status: SoldListingStatus;
  sortOrder: number;
}

interface Row {
  id: string;
  agent_id: string;
  image_url: string | null;
  address: string;
  price: number | null;
  status: SoldListingStatus;
  sort_order: number;
}

function toListing(r: Row): SoldListing {
  return {
    id: r.id,
    agentId: r.agent_id,
    imageUrl: r.image_url,
    address: r.address,
    price: r.price != null ? Number(r.price) : null,
    status: r.status,
    sortOrder: r.sort_order,
  };
}

/** Public: sold listings for a given agent (used on the public lead pages). */
export async function listSoldListingsForAgent(agentId: string): Promise<SoldListing[]> {
  const { data, error } = await supabase
    .from("sold_listings")
    .select("*")
    .eq("agent_id", agentId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data as Row[]).map(toListing);
}

/** Editor: the active agent's sold listings (operator manages these). */
export async function listMySoldListings(): Promise<SoldListing[]> {
  const agentId = await getActiveAgentId();
  return listSoldListingsForAgent(agentId);
}

export async function addSoldListing(input: { imageUrl: string | null; address: string; price: number | null; status: SoldListingStatus }): Promise<void> {
  const agentId = await getActiveAgentId();
  const { data: maxRow } = await supabase
    .from("sold_listings")
    .select("sort_order")
    .eq("agent_id", agentId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (maxRow?.sort_order ?? -1) + 1;
  const { error } = await supabase.from("sold_listings").insert({
    agent_id: agentId,
    image_url: input.imageUrl,
    address: input.address,
    price: input.price,
    status: input.status,
    sort_order: nextOrder,
  });
  if (error) throw new Error(error.message);
}

export async function deleteSoldListing(id: string): Promise<void> {
  const { error } = await supabase.from("sold_listings").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

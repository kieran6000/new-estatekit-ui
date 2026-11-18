import { supabase } from "./_client";

/** Conversions API setup for one pixel. The access token is write-only from the
 *  dashboard's point of view — it's never read back, so a token can be replaced
 *  but not copied out of the UI. */
export interface CapiConfig {
  pixelId: string;
  enabled: boolean;
  testEventCode: string | null;
  label: string;
  hasToken: boolean;
}

export async function getCapiConfig(pixelId: string): Promise<CapiConfig | null> {
  if (!pixelId) return null;
  // A SECURITY DEFINER read: it returns whether a token is stored (has_token)
  // without ever exposing the token itself. An enabled config with no stored
  // token is running on EstateKit's own connection (system-token mode).
  const { data, error } = await supabase
    .rpc("get_capi_config", { p_pixel_id: pixelId })
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { pixel_id: string; enabled: boolean; test_event_code: string | null; label: string | null; has_token: boolean };
  return {
    pixelId: row.pixel_id,
    enabled: row.enabled,
    testEventCode: row.test_event_code,
    label: row.label ?? "",
    hasToken: !!row.has_token,
  };
}

export async function saveCapiConfig(args: {
  pixelId: string;
  /** Omitted or empty leaves the stored token untouched. */
  accessToken?: string;
  enabled: boolean;
  testEventCode: string | null;
  /** Run on EstateKit's own connection — no token needed, and clears any
   *  stored one. The zero-paste path for an EstateKit-owned dataset. */
  system?: boolean;
}): Promise<void> {
  // A server-side save: browsers can't read the token column, and an upsert
  // that overwrites a column needs to read it.
  const { error } = await supabase.rpc("save_capi_config", {
    p_pixel_id: args.pixelId,
    p_enabled: args.enabled,
    p_test_event_code: args.testEventCode || null,
    p_access_token: args.accessToken?.trim() || null,
    p_system: args.system ?? false,
  });
  if (error) throw new Error(error.message);
}

/** The one-click check: can EstateKit's own connection already send to this
 *  dataset, with nothing pasted? True for datasets an EstateKit business owns,
 *  which is most clients. If false, the client's own Facebook owns it and a
 *  one-time key is needed. No token ever crosses to the browser. */
export async function probeSystemReach(pixelId: string): Promise<{ reachable: boolean; reason?: string }> {
  const clean = (pixelId || "").replace(/\D/g, "");
  if (!clean) return { reachable: false, reason: "Add the Dataset ID first." };
  const { data, error } = await supabase.functions.invoke("fb-capi-lead", {
    body: { probe: true, pixelId: clean },
  });
  if (error) return { reachable: false, reason: "Couldn't check just now. Try again in a moment." };
  const d = (data ?? {}) as { reachable?: boolean; reason?: string };
  return { reachable: !!d.reachable, reason: d.reason };
}

/** Fire one test lead at Facebook and report, in plain English, whether it was
 *  accepted — the honest green/red light for setup. Pass the token the agent
 *  just typed; leave it out to re-check an already-saved pixel. The test event
 *  only ever lands in Facebook's "Test events", never in live numbers. */
export async function checkCapiConnection(
  pixelId: string,
  accessToken?: string,
): Promise<{ ok: boolean; reason: string }> {
  const clean = (pixelId || "").replace(/\D/g, "");
  if (!clean) return { ok: false, reason: "Add the Dataset ID first, then check." };
  const { data, error } = await supabase.functions.invoke("fb-capi-lead", {
    body: { test: true, pixelId: clean, accessToken: accessToken?.trim() || undefined },
  });
  if (error) return { ok: false, reason: "Couldn't run the check just now. Try again in a moment." };
  const d = (data ?? {}) as { ok?: boolean; reason?: string };
  return { ok: !!d.ok, reason: d.reason ?? (d.ok ? "Working." : "Facebook didn't accept the test.") };
}

export interface CapiEventRow {
  id: string;
  event_name: string;
  status: string;
  created_at: string;
}

/** The most recent conversions reported for this pixel — the only honest way to
 *  tell whether the wiring actually works. */
export async function listCapiEvents(pixelId: string, limit = 5): Promise<CapiEventRow[]> {
  const { data, error } = await supabase
    .from("fb_capi_events")
    .select("id, event_name, status, created_at")
    .eq("pixel_id", pixelId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data ?? []) as CapiEventRow[];
}

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
  const { data, error } = await supabase
    .from("fb_capi_config")
    // Deliberately not selecting access_token: nothing in the browser needs it,
    // and not fetching it means it can't leak through the dashboard.
    .select("pixel_id, enabled, test_event_code, label")
    .eq("pixel_id", pixelId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    pixelId: data.pixel_id,
    enabled: data.enabled,
    testEventCode: data.test_event_code,
    label: data.label ?? "",
    // access_token is NOT NULL, so a saved config always has one.
    hasToken: true,
  };
}

export async function saveCapiConfig(args: {
  pixelId: string;
  /** Omitted or empty leaves the stored token untouched. */
  accessToken?: string;
  enabled: boolean;
  testEventCode: string | null;
}): Promise<void> {
  // A server-side save: browsers can't read the token column, and an upsert
  // that overwrites a column needs to read it.
  const { error } = await supabase.rpc("save_capi_config", {
    p_pixel_id: args.pixelId,
    p_enabled: args.enabled,
    p_test_event_code: args.testEventCode || null,
    p_access_token: args.accessToken?.trim() || null,
  });
  if (error) throw new Error(error.message);
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

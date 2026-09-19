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
    .select("pixel_id, enabled, test_event_code, label, access_token")
    .eq("pixel_id", pixelId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    pixelId: data.pixel_id,
    enabled: data.enabled,
    testEventCode: data.test_event_code,
    label: data.label ?? "",
    hasToken: !!data.access_token,
  };
}

export async function saveCapiConfig(args: {
  pixelId: string;
  /** Omitted or empty leaves the stored token untouched. */
  accessToken?: string;
  enabled: boolean;
  testEventCode: string | null;
}): Promise<void> {
  const row: Record<string, unknown> = {
    pixel_id: args.pixelId,
    enabled: args.enabled,
    test_event_code: args.testEventCode || null,
  };
  if (args.accessToken?.trim()) row.access_token = args.accessToken.trim();

  const { error } = await supabase
    .from("fb_capi_config")
    .upsert(row, { onConflict: "pixel_id" });
  if (error) throw new Error(error.message);
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

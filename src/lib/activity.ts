import { supabase, getActiveAgentIdSync } from "../api/_client";
import { getMyRealDisplayName } from "../api/agentProfile";

type ActivityEvent =
  | "login" | "new_lead" | "form_submitted" | "lead_disqualified" | "stage_change"
  | "call_started" | "note_added" | "lead_page_created" | "lead_page_deleted" | "sold_listing_added"
  | "ad_paused" | "ad_resumed"
  | "form_type_changed" | "email_switched" | "email_wording_changed" | "client_details_edited"
  | "whatsapp_number_changed" | "page_link_changed";

// Changes to an account's setup: the log also says who made them.
const SETUP_EVENTS: ActivityEvent[] = [
  "form_type_changed", "email_switched", "email_wording_changed", "client_details_edited",
  "whatsapp_number_changed", "page_link_changed",
];

interface ActivityPayload {
  agentId?: string;
  actorName?: string;
  lead?: { id?: string; name?: string; phone?: string; address?: string; stage?: string; fromStage?: string; toStage?: string; pipeline?: string; source?: string; reason?: string };
  page?: { name?: string; slug?: string };
  sale?: { address?: string; price?: number };
  ad?: { name?: string; link?: string };
  /** A short line saying what changed, shown as "Details". */
  detail?: string;
}

interface PostHogLike { get_session_id?: () => string; get_distinct_id?: () => string }

// The @posthog/react provider doesn't reliably put the instance on window, so
// a component registers it here for us to read session ids from.
let registeredPh: PostHogLike | null = null;
export function registerActivityPostHog(ph: PostHogLike): void {
  registeredPh = ph;
}

/** Fire-and-forget world-class activity ping to the Discord webhook (via the
 *  track-activity edge function). Never blocks or throws in the UI. */
export function trackActivity(event: ActivityEvent, payload: ActivityPayload = {}): void {
  try {
    const ph = registeredPh ?? (window as unknown as { posthog?: PostHogLike }).posthog;
    let sessionId: string | undefined;
    let distinctId: string | undefined;
    try { sessionId = ph?.get_session_id?.(); } catch { /* ignore */ }
    try { distinctId = ph?.get_distinct_id?.(); } catch { /* ignore */ }

    const body = {
      event,
      agentId: payload.agentId ?? getActiveAgentIdSync() ?? undefined,
      actorName: payload.actorName,
      lead: payload.lead,
      page: payload.page,
      sale: payload.sale,
      ad: payload.ad,
      detail: payload.detail,
      device: navigator.userAgent,
      sessionId,
      distinctId,
    };
    // Don't await — activity logging must never slow down or break the UI.
    const send = async () => {
      if (!body.actorName && SETUP_EVENTS.includes(event)) {
        body.actorName = await getMyRealDisplayName().catch(() => undefined);
      }
      await supabase.functions.invoke("track-activity", { body });
    };
    void send().catch(() => {});
  } catch {
    /* never let tracking break anything */
  }
}

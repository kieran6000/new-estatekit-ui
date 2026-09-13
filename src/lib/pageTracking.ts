import { supabase } from "../api/_client";

// Funnel tracking for published landing pages. Each step is sent to the
// track-page-event function, which stores it once per visitor session and
// posts it to Discord.

export type PageFunnelEvent = "view" | "start" | "contact" | "disqualified" | "submit";

function sessionIdFor(pageId: string): string {
  const key = `ek_page_session_${pageId}`;
  try {
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
    return id;
  } catch {
    // Storage blocked: fall back to one id per page load.
    return (window as unknown as { __ekSession?: string }).__ekSession ??=
      crypto.randomUUID();
  }
}

/** Where the visitor came from, in a word or two. */
function trafficSource(): string {
  try {
    const params = new URLSearchParams(window.location.search);
    const utm = params.get("utm_source");
    if (utm) return utm;
    if (params.has("fbclid")) return "Facebook ad";
    if (document.referrer) {
      const host = new URL(document.referrer).hostname.replace(/^www\./, "");
      if (host && host !== window.location.hostname) return host;
    }
  } catch { /* ignore */ }
  return "Direct";
}

/** Fire-and-forget. Skipped for anyone signed in, so agents and admins opening
 *  their own page don't inflate the numbers or the Discord channel. */
export function trackPageEvent(pageId: string, event: PageFunnelEvent, detail?: string): void {
  void (async () => {
    try {
      const { data } = await supabase.auth.getSession();
      if (data.session) return;
      await supabase.functions.invoke("track-page-event", {
        body: { pageId, sessionId: sessionIdFor(pageId), event, source: trafficSource(), detail },
      });
    } catch {
      /* tracking must never affect the page */
    }
  })();
}

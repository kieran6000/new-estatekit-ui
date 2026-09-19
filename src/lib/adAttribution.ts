// Where a landing-page visitor came from.
//
// Captured on the FIRST page view and kept in sessionStorage, because the form
// is multi-step and the visitor may land on /p/<slug>?utm_content=... but
// submit several steps later — by which point the parameters are long gone
// from anything we'd otherwise read.
//
// For Meta traffic, the ad id only arrives if the ad's URL carries it. Set the
// landing page URL's parameters in Ads Manager to Meta's macros, e.g.
//   ?ad_id={{ad.id}}&adset_id={{adset.id}}&campaign_id={{campaign.id}}
// Without those, fbclid still tells us it was Facebook, but not which ad.

export interface AdAttribution extends Partial<Record<string, string>> {
  ad_id?: string;
  adset_id?: string;
  campaign_id?: string;
  ad_name?: string;
  campaign_name?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  fbclid?: string;
  gclid?: string;
  referrer?: string;
}

const KEY_PREFIX = "ek_attribution_";

// Meta's macros are the reliable path; utm_* is the generic fallback. utm_content
// is included last so an explicit ad_id always wins when both are present.
const PARAM_KEYS: string[] = [
  "ad_id", "adset_id", "campaign_id", "ad_name", "campaign_name",
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
  "fbclid", "gclid",
];

function storageKey(pageId: string): string {
  return `${KEY_PREFIX}${pageId}`;
}

/** Read the attribution out of the current URL. Values are length-capped so a
 *  junk or hostile query string can't bloat the row. */
function fromUrl(): AdAttribution {
  const out: AdAttribution = {};
  try {
    const params = new URLSearchParams(window.location.search);
    for (const key of PARAM_KEYS) {
      const value = params.get(key);
      if (value) out[key] = value.slice(0, 200);
    }
    if (document.referrer) {
      const host = new URL(document.referrer).hostname.replace(/^www\./, "");
      if (host && host !== window.location.hostname) out.referrer = host.slice(0, 200);
    }
  } catch { /* malformed URL or blocked referrer — not worth failing over */ }
  return out;
}

/**
 * Capture attribution for this page once per session.
 *
 * Only the first visit of a session writes, so a visitor who navigates away and
 * comes back directly keeps the ad that originally brought them, rather than
 * being reattributed to "Direct".
 */
export function captureAttribution(pageId: string): void {
  try {
    const key = storageKey(pageId);
    if (sessionStorage.getItem(key)) return;
    const found = fromUrl();
    if (Object.keys(found).length === 0) return;
    sessionStorage.setItem(key, JSON.stringify(found));
  } catch { /* private browsing — attribution is best-effort */ }
}

/** What was captured for this page, for sending along with the lead. */
export function readAttribution(pageId: string): AdAttribution {
  try {
    const raw = sessionStorage.getItem(storageKey(pageId));
    if (raw) return JSON.parse(raw) as AdAttribution;
  } catch { /* fall through */ }
  // Nothing stored (storage blocked, or a single-step submit on the landing
  // hit) — read the URL directly so we still capture something.
  return fromUrl();
}

/** A short human label for the lead list: "Facebook ad", "Google", "Direct". */
export function describeAttribution(a: AdAttribution | null | undefined): string {
  if (!a || Object.keys(a).length === 0) return "Direct";
  if (a.ad_id || a.fbclid || a.utm_source?.toLowerCase().includes("facebook") || a.utm_source?.toLowerCase() === "fb") {
    return "Facebook ad";
  }
  if (a.gclid || a.utm_source?.toLowerCase().includes("google")) return "Google";
  if (a.utm_source) return a.utm_source;
  if (a.referrer) return a.referrer;
  return "Direct";
}

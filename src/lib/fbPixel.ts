// Meta Pixel helpers. The base loader (window.fbq) is defined in index.html,
// so it appears in the page source; here we init the agent's own pixel and
// fire events at runtime.

type Fbq = (...args: unknown[]) => void;
interface FbWindow { fbq?: Fbq; __ekPixel?: string }

function digitsOnly(id: string): string {
  return (id || "").replace(/\D/g, "");
}

/** Init an agent's pixel (once) and fire PageView. Adds a <noscript> fallback. */
export function initPixel(rawId: string | null | undefined): string | null {
  const id = digitsOnly(rawId || "");
  const w = window as unknown as FbWindow;
  if (!id || typeof w.fbq !== "function" || w.__ekPixel === id) return id || null;
  w.__ekPixel = id;
  w.fbq("init", id);
  w.fbq("track", "PageView");
  if (!document.getElementById("fb-pixel-noscript")) {
    const ns = document.createElement("noscript");
    ns.id = "fb-pixel-noscript";
    ns.innerHTML = `<img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=${encodeURIComponent(id)}&ev=PageView&noscript=1"/>`;
    document.head.appendChild(ns);
  }
  return id;
}

/**
 * Fire a standard event (e.g. "Lead"). Safe no-op if the pixel isn't loaded.
 *
 * `eventId` must match the one sent to the Conversions API for the same
 * conversion — Meta uses it to collapse the browser event and the server event
 * into one, instead of counting the lead twice.
 */
export function trackPixel(event: string, eventId?: string): void {
  const w = window as unknown as FbWindow;
  if (typeof w.fbq === "function") {
    if (eventId) w.fbq("track", event, {}, { eventID: eventId });
    else w.fbq("track", event);
  }
}

/** Meta's browser cookie, passed to the Conversions API to improve matching.
 *  Absent when the pixel hasn't set it (blocked, or first hit). */
export function readFbp(): string | undefined {
  try {
    return document.cookie.split("; ").find((c) => c.startsWith("_fbp="))?.split("=")[1];
  } catch {
    return undefined;
  }
}

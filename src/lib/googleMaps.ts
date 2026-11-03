import { supabase } from "../api/_client";
import { addressKey, type LatLng } from "./geo";

// Google's map, geocoder and Street View photo, with the key that's locked to
// our own site. Each address is only looked up once (geocode_cache). Anything
// going wrong here is not an error for the agent: the caller falls back to
// Google's plain embed.

const KEY = (import.meta.env.VITE_GOOGLE_MAPS_KEY as string | undefined) || "";

export const hasMapsKey = () => !!KEY;

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
type GoogleMaps = any;
declare global {
  interface Window {
    google?: { maps: GoogleMaps };
    gm_authFailure?: () => void;
    ekMapsReady?: () => void;
  }
}

let loading: Promise<GoogleMaps> | null = null;

// Google can refuse the key after its code has loaded, so that's told apart
// from loading: anyone drawing a map listens for it.
let keyRefused = false;
const refusedListeners = new Set<() => void>();

/** Calls back if Google refuses the key, now or later. Gives back how to stop. */
export function onMapsKeyRefused(listener: () => void): () => void {
  if (keyRefused) listener();
  refusedListeners.add(listener);
  return () => { refusedListeners.delete(listener); };
}

export function loadGoogleMaps(): Promise<GoogleMaps> {
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    if (!KEY) { reject(new Error("no maps key")); return; }
    window.gm_authFailure = () => {
      keyRefused = true;
      refusedListeners.forEach((l) => l());
      reject(new Error("maps key refused"));
    };
    window.ekMapsReady = () => resolve(window.google!.maps);
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${KEY}&v=weekly&loading=async&callback=ekMapsReady`;
    s.async = true;
    s.onerror = () => reject(new Error("maps failed to load"));
    document.head.appendChild(s);
  });
  loading.catch(() => { loading = null; });
  return loading;
}

let warmed = false;

/** Fetches the map code when the page is idle, so the map doesn't wait for it
 *  after the tap. Google only charges for a map being drawn, not for this. */
export function warmUpMaps(): void {
  if (warmed || !KEY) return;
  warmed = true;
  const go = () => loadGoogleMaps().then((maps) => Promise.all([maps.importLibrary("maps"), maps.importLibrary("marker")])).catch(() => { warmed = false; });
  if ("requestIdleCallback" in window) window.requestIdleCallback(go, { timeout: 2000 });
  else setTimeout(go, 500);
}

export interface Geocoded extends LatLng {
  /** Google matched the address itself, not just the street or the area. */
  exact: boolean;
}

interface CacheRow { lat: number | null; lng: number | null; exact: boolean }

/** What we've saved for an address: where it is, null if Google found nothing,
 *  or "unknown" if it hasn't been looked up. Never asks Google, so it's free. */
export async function cachedGeocode(address: string): Promise<Geocoded | null | "unknown"> {
  const { data } = await supabase.from("geocode_cache").select("lat, lng, exact").eq("address_key", addressKey(address)).maybeSingle();
  const hit = data as CacheRow | null;
  if (!hit) return "unknown";
  return hit.lat != null && hit.lng != null ? { lat: hit.lat, lng: hit.lng, exact: hit.exact } : null;
}

/** Where an address is, or null if Google can't find it. Throws if Google
 *  can't be asked at all, so that isn't remembered as "not found". */
export async function geocodeAddress(address: string): Promise<Geocoded | null> {
  const key = addressKey(address);
  const saved = await cachedGeocode(address);
  if (saved !== "unknown") return saved;

  const maps = await loadGoogleMaps();
  const { Geocoder } = await maps.importLibrary("geocoding");
  let found: Geocoded | null = null;
  try {
    const { results } = await new Geocoder().geocode({ address, componentRestrictions: { country: "ZA" } });
    const r = results?.[0];
    if (r) {
      const type = r.geometry.location_type;
      found = {
        lat: r.geometry.location.lat(),
        lng: r.geometry.location.lng(),
        exact: !r.partial_match && (type === "ROOFTOP" || type === "RANGE_INTERPOLATED"),
      };
    }
  } catch (e) {
    if ((e as { code?: string })?.code !== "ZERO_RESULTS") throw e;
  }
  // Best effort: if saving fails it's only asked again next time.
  await supabase.from("geocode_cache").insert({ address_key: key, lat: found?.lat ?? null, lng: found?.lng ?? null, exact: found?.exact ?? false }).then(() => {}, () => {});
  return found;
}

export const HOUSE_PIN = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="46" viewBox="0 0 40 46"><path d="M4 0h32a4 4 0 0 1 4 4v30a4 4 0 0 1-4 4h-9l-7 8-7-8H4a4 4 0 0 1-4-4V4a4 4 0 0 1 4-4z" fill="#0b57d0"/><path d="M20 8 8 19h4v11h6v-7h4v7h6V19h4z" fill="#fff"/></svg>`,
)}`;

const PIN_BLUE = "#0b57d0";
export const UNSURE_METRES = 350;
const RIPPLE_MS = 3600;

/** A faint circle round a pin we're not sure of, with a slow ripple moving out
 *  to its edge. Still for people who've asked their phone for less motion.
 *  Gives back how to stop it. */
function drawUnsureArea(maps: GoogleMaps, map: GoogleMaps, at: LatLng): () => void {
  const circle = (radius: number, fillOpacity: number, strokeOpacity: number) =>
    new maps.Circle({ map, center: at, radius, fillColor: PIN_BLUE, fillOpacity, strokeColor: PIN_BLUE, strokeOpacity, strokeWeight: 1, clickable: false });
  const area = circle(UNSURE_METRES, 0.05, 0.22);
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return () => area.setMap(null);
  const ripple = circle(0, 0.08, 0);
  const started = performance.now();
  let frame = requestAnimationFrame(function tick(now) {
    const t = ((now - started) % RIPPLE_MS) / RIPPLE_MS;
    ripple.setOptions({ radius: UNSURE_METRES * t, fillOpacity: 0.08 * (1 - t) });
    frame = requestAnimationFrame(tick);
  });
  return () => {
    cancelAnimationFrame(frame);
    ripple.setMap(null);
    area.setMap(null);
  };
}

/** A clean road map on this element with our house pin. Says when it can be
 *  seen, and gives back how to stop anything it left running. */
export async function drawMap(el: HTMLElement, at: LatLng, zoom: number, unsure: boolean, onReady: () => void): Promise<() => void> {
  const maps = await loadGoogleMaps();
  const { Map } = await maps.importLibrary("maps");
  const { Marker } = await maps.importLibrary("marker");
  const map = new Map(el, {
    center: at,
    zoom,
    disableDefaultUI: true,
    zoomControl: true,
    keyboardShortcuts: false,
    clickableIcons: false,
    gestureHandling: "greedy",
    styles: [
      { featureType: "poi.business", stylers: [{ visibility: "off" }] },
      { featureType: "transit", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
    ],
  });
  map.addListener("tilesloaded", onReady);
  new Marker({ map, position: at, zIndex: 2, icon: { url: HOUSE_PIN, anchor: new maps.Point(20, 46) } });
  return unsure ? drawUnsureArea(maps, map, at) : () => {};
}

/** The same map as one picture. It arrives well before the live map's squares
 *  (about 1s against 3-4s), so it's shown until they're in. Asked for at the
 *  size it's shown so it lines up exactly with the live map. */
export const staticMapUrl = (at: LatLng, zoom: number, width: number, height: number) =>
  `https://maps.googleapis.com/maps/api/staticmap?center=${at.lat},${at.lng}&zoom=${zoom}&size=${Math.min(width, 640)}x${Math.min(height, 640)}&scale=2&style=feature:poi.business|visibility:off&style=feature:transit|element:labels.icon|visibility:off&key=${KEY}`;

/** How many screen pixels a distance covers on the map here. */
export const metresToPixels = (metres: number, lat: number, zoom: number) =>
  metres / ((156543.03 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom);

/** Google's photo from the road, in the shape it'll be shown so none of it is
 *  cut off. Gives an error instead of a grey "no image" picture when there
 *  isn't one, so the <img> can hide itself. */
export const streetPhotoUrl = (at: LatLng, width: number, height: number) =>
  `https://maps.googleapis.com/maps/api/streetview?size=${width}x${height}&location=${at.lat},${at.lng}&source=outdoor&return_error_code=true&key=${KEY}`;

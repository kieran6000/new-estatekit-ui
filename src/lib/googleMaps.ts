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

export function loadGoogleMaps(): Promise<GoogleMaps> {
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    if (!KEY) { reject(new Error("no maps key")); return; }
    window.gm_authFailure = () => reject(new Error("maps key refused"));
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

export interface Geocoded extends LatLng {
  /** Google matched the address itself, not just the street or the area. */
  exact: boolean;
}

interface CacheRow { lat: number | null; lng: number | null; exact: boolean }

/** Where an address is, or null if Google can't find it. Throws if Google
 *  can't be asked at all, so that isn't remembered as "not found". */
export async function geocodeAddress(address: string): Promise<Geocoded | null> {
  const key = addressKey(address);
  const { data } = await supabase.from("geocode_cache").select("lat, lng, exact").eq("address_key", key).maybeSingle();
  const hit = data as CacheRow | null;
  if (hit) return hit.lat != null && hit.lng != null ? { lat: hit.lat, lng: hit.lng, exact: hit.exact } : null;

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

const HOUSE_PIN = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="46" viewBox="0 0 40 46"><path d="M4 0h32a4 4 0 0 1 4 4v30a4 4 0 0 1-4 4h-9l-7 8-7-8H4a4 4 0 0 1-4-4V4a4 4 0 0 1 4-4z" fill="#0b57d0"/><path d="M20 8 8 19h4v11h6v-7h4v7h6V19h4z" fill="#fff"/></svg>`,
)}`;

/** A clean road map on this element with our house pin. */
export async function drawMap(el: HTMLElement, at: LatLng, zoom: number): Promise<void> {
  const maps = await loadGoogleMaps();
  const { Map } = await maps.importLibrary("maps");
  const { Marker } = await maps.importLibrary("marker");
  const map = new Map(el, {
    center: at,
    zoom,
    disableDefaultUI: true,
    zoomControl: true,
    clickableIcons: false,
    gestureHandling: "greedy",
    styles: [
      { featureType: "poi.business", stylers: [{ visibility: "off" }] },
      { featureType: "transit", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
    ],
  });
  new Marker({ map, position: at, icon: { url: HOUSE_PIN, anchor: new maps.Point(20, 46) } });
}

/** Google's photo from the road. Gives an error instead of a grey "no image"
 *  picture when there isn't one, so the <img> can hide itself. */
export const streetPhotoUrl = (at: LatLng) =>
  `https://maps.googleapis.com/maps/api/streetview?size=640x320&location=${at.lat},${at.lng}&source=outdoor&return_error_code=true&key=${KEY}`;

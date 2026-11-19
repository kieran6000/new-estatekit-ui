import { supabase } from "../api/_client";
import { prettyAnswer } from "./format";
import { addressKey, CLOSE_BY_KM, middleOf, type LatLng, type Zone } from "./geo";

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

/** A vague address ("35 Viking Road", no suburb) exists in a dozen SA towns, and
 *  Google returns the most famous one — often the wrong city. When we know
 *  roughly where this agent's leads sit, we nudge the lookup toward there, so an
 *  ambiguous address lands in the right area. A fully-specified address still
 *  resolves where it says: bounds only breaks ties, it doesn't override. */
const BIAS_DEG = 0.4; // ~44 km box around the agent's area

/** The cache key for a lookup. A biased lookup is stored apart from the plain
 *  one, so one agent's nudge can't poison another agent's view of the same
 *  street name. */
const lookupKey = (address: string, bias?: LatLng | null) =>
  bias ? `${addressKey(address)}@${bias.lat.toFixed(2)},${bias.lng.toFixed(2)}` : addressKey(address);

async function cachedByKey(key: string): Promise<Geocoded | null | "unknown"> {
  const { data } = await supabase.from("geocode_cache").select("lat, lng, exact").eq("address_key", key).maybeSingle();
  const hit = data as CacheRow | null;
  if (!hit) return "unknown";
  return hit.lat != null && hit.lng != null ? { lat: hit.lat, lng: hit.lng, exact: hit.exact } : null;
}

/** Where an address is, or null if Google can't find it. Throws if Google
 *  can't be asked at all, so that isn't remembered as "not found". With a bias
 *  point, an ambiguous address is pulled toward the agent's area. */
export async function geocodeAddress(address: string, bias?: LatLng | null): Promise<Geocoded | null> {
  const key = lookupKey(address, bias);
  const saved = await cachedByKey(key);
  if (saved !== "unknown") return saved;

  const maps = await loadGoogleMaps();
  const { Geocoder } = await maps.importLibrary("geocoding");
  let found: Geocoded | null = null;
  try {
    const request: Record<string, unknown> = { address, componentRestrictions: { country: "ZA" } };
    if (bias) request.bounds = { south: bias.lat - BIAS_DEG, west: bias.lng - BIAS_DEG, north: bias.lat + BIAS_DEG, east: bias.lng + BIAS_DEG };
    const { results } = await new Geocoder().geocode(request);
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

/** The address an agent's lead gave, from their form answers (the property
 *  address, not an email). Mirrors the lead-area map's reading of a form. */
function leadFormAddress(answers: { q: string; a: string }[] | null): string | null {
  const hit = (answers ?? []).find((x) => /address/i.test(x.q) && !/mail/i.test(x.q) && prettyAnswer(x.a).trim().length > 4);
  return hit ? prettyAnswer(hit.a).trim() : null;
}

const MIN_BIAS_POINTS = 3;

/** Roughly where this agent's leads sit — the middle of the lead addresses we've
 *  already placed (no new Google calls, so it's free and instant). Used only to
 *  nudge a vague new address toward the right city. null until we've placed a
 *  few of their leads, in which case a lookup just runs unbiased, as before. */
export async function agentAreaBias(agentId: string): Promise<LatLng | null> {
  const { data } = await supabase
    .from("leads").select("form_answers").eq("agent_id", agentId).order("created_at", { ascending: false }).limit(200);
  const keys = [...new Set(
    (data ?? [])
      .map((l) => leadFormAddress(l.form_answers as { q: string; a: string }[] | null))
      .filter((a): a is string => !!a)
      .map((a) => addressKey(a)),
  )];
  if (keys.length === 0) return null;
  const points: LatLng[] = [];
  for (let i = 0; i < keys.length; i += 100) {
    const { data: rows } = await supabase
      .from("geocode_cache").select("lat, lng").in("address_key", keys.slice(i, i + 100));
    for (const row of (rows ?? []) as { lat: number | null; lng: number | null }[]) {
      if (row.lat != null && row.lng != null) points.push({ lat: row.lat, lng: row.lng });
    }
  }
  return points.length >= MIN_BIAS_POINTS ? middleOf(points) : null;
}

const LOOKUP_LIMIT_MS = 4000;

/** Where many addresses are. Saved ones come straight from geocode_cache; up to
 *  maxNew others are looked up, one at a time, and saved so that's only once. */
export async function geocodeMany(addresses: string[], maxNew: number): Promise<Map<string, Geocoded>> {
  const found = new Map<string, Geocoded>();
  const wanted = [...new Map(addresses.map((a) => [addressKey(a), a])).entries()];
  const saved = new Set<string>();
  for (let i = 0; i < wanted.length; i += 100) {
    const { data } = await supabase.from("geocode_cache").select("address_key, lat, lng, exact").in("address_key", wanted.slice(i, i + 100).map(([k]) => k));
    for (const row of (data ?? []) as (CacheRow & { address_key: string })[]) {
      saved.add(row.address_key);
      if (row.lat != null && row.lng != null) found.set(row.address_key, { lat: row.lat, lng: row.lng, exact: row.exact });
    }
  }
  for (const [key, address] of wanted.filter(([k]) => !saved.has(k)).slice(0, maxNew)) {
    // Google can go quiet without saying no. Show what we have rather than wait.
    const at = await Promise.race([
      geocodeAddress(address).catch(() => null),
      new Promise<"quiet">((done) => setTimeout(() => done("quiet"), LOOKUP_LIMIT_MS)),
    ]);
    if (at === "quiet") break;
    if (at) found.set(key, at);
  }
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

export const ZONE_COLOR = "#0b57d0";
const DOT_COLOR = "#1f2937";

// Nearly blank: land, water, main roads and town names. Nothing else competes with the dots.
const QUIET_MAP = [
  { elementType: "geometry", stylers: [{ color: "#f4f5f7" }] },
  { elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#dbe4ee" }] },
  { featureType: "road", stylers: [{ visibility: "off" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ visibility: "on" }, { color: "#e3e6ea" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ visibility: "off" }] },
  ];

/** Their area as one soft circle, with a dot for each lead, on a quiet map. The
 *  map is framed on the circle and what's close by. With no area, it fits the leads. */
export async function drawLeadMap(el: HTMLElement, zone: Zone | null, leads: LatLng[], onReady: () => void): Promise<void> {
  const maps = await loadGoogleMaps();
  const { Map } = await maps.importLibrary("maps");
  const { Marker } = await maps.importLibrary("marker");
  const map = new Map(el, { disableDefaultUI: true, keyboardShortcuts: false, clickableIcons: false, gestureHandling: "none", styles: QUIET_MAP });
  map.addListener("tilesloaded", onReady);
  if (zone) {
    new maps.Circle({ map, center: zone.center, radius: zone.km * 1000, fillColor: ZONE_COLOR, fillOpacity: 0.12, strokeColor: ZONE_COLOR, strokeOpacity: 0.45, strokeWeight: 1.5, clickable: false });
    map.fitBounds(new maps.Circle({ center: zone.center, radius: (zone.km + CLOSE_BY_KM) * 1000 }).getBounds(), 2);
  } else {
    const bounds = new maps.LatLngBounds();
    for (const p of leads) bounds.extend(p);
    map.fitBounds(bounds, 28);
  }
  maps.event.addListenerOnce(map, "idle", () => { if (map.getZoom() > 13) map.setZoom(13); });
  for (const position of leads) {
    new Marker({ map, position, clickable: false, icon: { path: maps.SymbolPath.CIRCLE, scale: 3.5, fillColor: DOT_COLOR, fillOpacity: 0.9, strokeColor: "#ffffff", strokeWeight: 1 } });
  }
}

export interface LatLng { lat: number; lng: number }

/** Straight-line distance in km. */
export function distanceKm(a: LatLng, b: LatLng): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/** The same address however it was typed, for looking it up once. */
export const addressKey = (address: string) => address.trim().toLowerCase().replace(/\s+/g, " ");

/** Those within reach of a point, closest first, with how far each is. */
export function nearby<T extends { at: LatLng | null }>(from: LatLng, items: T[], withinKm: number): (T & { km: number })[] {
  return items
    .flatMap((i) => (i.at ? [{ ...i, km: distanceKm(from, i.at) }] : []))
    .filter((i) => i.km <= withinKm)
    .sort((x, y) => x.km - y.km);
}

/** How close a lead must be to the middle of a suburb to count as in it. Rough:
 *  we only know where a suburb's middle is, not its edges. */
export const AREA_KM = 4;
const CITY_KM = 14;
const CITIES = /^(centurion|pretoria|tshwane|midrand|johannesburg|joburg|jhb|sandton|randburg|roodepoort|boksburg|benoni|kempton park|ekurhuleni|east rand|durban|cape town|bloemfontein|gqeberha|port elizabeth|george|polokwane|nelspruit|mbombela|rustenburg|mafikeng|mahikeng|pietermaritzburg|stellenbosch|east london)$/i;

/** How far an area they named reaches: a whole city goes much further than a suburb. */
export const isCity = (name: string) => CITIES.test(name.trim());
export const areaKm = (name: string) => (isCity(name) ? CITY_KM : AREA_KM);

/** A circle on the map: one or more areas they asked for that sit together. */
export interface Zone { center: LatLng; km: number }

/** Suburbs closer together than this become one circle, not a pile of overlapping ones. */
const SAME_ZONE_KM = 20;
/** Outside their area but within this of its edge counts as close by. */
export const CLOSE_BY_KM = 10;

/** The areas they asked for, as simple circles. Areas that sit together share one. */
export function zonesFrom(areas: { at: LatLng; km: number }[]): Zone[] {
  const groups: { at: LatLng; km: number }[][] = [];
  for (const area of areas) {
    const touching = groups.filter((g) => g.some((a) => distanceKm(a.at, area.at) <= SAME_ZONE_KM));
    const merged = [area, ...touching.flat()];
    for (const g of touching) groups.splice(groups.indexOf(g), 1);
    groups.push(merged);
  }
  return groups.map((g) => {
    const lats = g.map((a) => a.at.lat);
    const lngs = g.map((a) => a.at.lng);
    const center = { lat: (Math.min(...lats) + Math.max(...lats)) / 2, lng: (Math.min(...lngs) + Math.max(...lngs)) / 2 };
    return { center, km: Math.max(...g.map((a) => distanceKm(center, a.at) + a.km)) };
  });
}

export type LeadPlace = "in" | "near" | "far";

/** Is this lead in their area, close by, or further away? */
export function placeOf(lead: LatLng, zones: Zone[]): LeadPlace {
  const fromEdge = Math.min(...zones.map((z) => distanceKm(lead, z.center) - z.km));
  return fromEdge <= 0 ? "in" : fromEdge <= CLOSE_BY_KM ? "near" : "far";
}

/** The middle of a set of points, not pulled off course by a far-away one. */
export function middleOf(points: LatLng[]): LatLng | null {
  if (!points.length) return null;
  const mid = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];
  return { lat: mid(points.map((p) => p.lat)), lng: mid(points.map((p) => p.lng)) };
}

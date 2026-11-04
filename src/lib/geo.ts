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

export interface AreaCount<T> { area: T; leads: number }

/** Which of their chosen areas each lead falls in (the closest one), how many
 *  fall in none of them, and the busiest areas first. */
export function leadsByArea<T extends { at: LatLng; km: number }>(leads: LatLng[], areas: T[]): { counts: AreaCount<T>[]; inArea: number; outside: number } {
  const counts = areas.map((area) => ({ area, leads: 0 }));
  let inArea = 0;
  for (const lead of leads) {
    let best: AreaCount<T> | null = null;
    let bestKm = Infinity;
    for (const c of counts) {
      const km = distanceKm(lead, c.area.at);
      if (km <= c.area.km && km < bestKm) { best = c; bestKm = km; }
    }
    if (best) { best.leads += 1; inArea += 1; }
  }
  return { counts: [...counts].sort((a, b) => b.leads - a.leads), inArea, outside: leads.length - inArea };
}

/** The middle of a set of points, not pulled off course by a far-away one. */
export function middleOf(points: LatLng[]): LatLng | null {
  if (!points.length) return null;
  const mid = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];
  return { lat: mid(points.map((p) => p.lat)), lng: mid(points.map((p) => p.lng)) };
}

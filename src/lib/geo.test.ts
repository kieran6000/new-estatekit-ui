import { describe, expect, it } from "vitest";
import { addressKey, distanceKm, nearby, areaKm, inAnyArea, middleOf } from "./geo";

const moreleta = { lat: -25.8235, lng: 28.2915 };
const faeryGlen = { lat: -25.7905, lng: 28.2905 };
const capeTown = { lat: -33.9249, lng: 18.4241 };

describe("geo", () => {
  it("measures distance in km", () => {
    expect(distanceKm(moreleta, faeryGlen)).toBeCloseTo(3.67, 1);
    expect(distanceKm(moreleta, moreleta)).toBe(0);
  });

  it("treats the same address the same, however it was typed", () => {
    expect(addressKey("  93 Third  Avenue, Rondebosch East ")).toBe("93 third avenue, rondebosch east");
  });

  it("keeps only what's close, closest first, and skips what has no location", () => {
    const items = [
      { name: "far", at: capeTown },
      { name: "none", at: null },
      { name: "near", at: faeryGlen },
      { name: "here", at: moreleta },
    ];
    expect(nearby(moreleta, items, 5).map((i) => i.name)).toEqual(["here", "near"]);
  });
});

describe("leads by area", () => {
  const near = { lat: -25.86, lng: 28.19 };
  it("knows a lead is in an area, and gives a whole city more reach than a suburb", () => {
    const suburb = { at: near, km: areaKm("Lyttelton") };
    const city = { at: near, km: areaKm("Centurion") };
    const lead = { lat: -25.93, lng: 28.19 };
    expect(inAnyArea(lead, [suburb])).toBe(false);
    expect(inAnyArea(lead, [suburb, city])).toBe(true);
    expect(inAnyArea(lead, [])).toBe(false);
  });
  it("finds the middle without being pulled away by one far lead", () => {
    expect(middleOf([near, near, { lat: -33.9, lng: 18.4 }])).toEqual(near);
    expect(middleOf([])).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { decodePolyline, haversineKm, RoutePath } from "@/lib/geo";

describe("decodePolyline", () => {
  it("decodes the reference example", () => {
    // Example from Google's polyline algorithm documentation.
    expect(decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@")).toEqual([
      { lat: 38.5, lng: -120.2 },
      { lat: 40.7, lng: -120.95 },
      { lat: 43.252, lng: -126.453 },
    ]);
  });

  it("rejects truncated input", () => {
    expect(() => decodePolyline("_p~iF~ps|U_")).toThrow();
  });
});

describe("RoutePath", () => {
  const a = { lat: 47.5, lng: 19.0 };
  const b = { lat: 47.5, lng: 20.0 };
  const c = { lat: 48.5, lng: 20.0 };

  it("scales to the reported distance and interpolates", () => {
    const raw = haversineKm(a, b) + haversineKm(b, c);
    const path = new RoutePath([a, b, c], raw * 2);
    expect(path.totalKm).toBeCloseTo(raw * 2);
    const mid = path.pointAtKm(haversineKm(a, b)); // halfway along the first segment after scaling
    expect(mid.lat).toBeCloseTo(47.5);
    expect(mid.lng).toBeCloseTo(19.5, 1);
    expect(path.pointAtKm(-5)).toEqual(a);
    expect(path.pointAtKm(1e9)).toEqual(c);
  });

  it("samples both ends and caps the sample count", () => {
    const path = new RoutePath([a, b, c]);
    const samples = path.sample(1, 5);
    expect(samples).toHaveLength(5);
    expect(samples[0]).toEqual(a);
    expect(samples[4].lat).toBeCloseTo(c.lat);
  });
});

describe("RoutePath crossings", () => {
  // A straight west→east line from lng 16 to 18 along lat 47.5 (~150 km).
  const path = new RoutePath([
    { lat: 47.5, lng: 16 },
    { lat: 47.5, lng: 17 },
    { lat: 47.5, lng: 18 },
  ]);
  const region = (p: { lng: number }) => (p.lng < 16.5 ? "AT" : p.lng < 17.5 ? "HU" : "SK");

  it("finds each border in order, precisely", () => {
    const xs = path.crossings(region, 1, 0.01);
    expect(xs.map((x) => [x.from, x.to])).toEqual([
      ["AT", "HU"],
      ["HU", "SK"],
    ]);
    expect(xs[0].point.lng).toBeCloseTo(16.5, 3);
    expect(xs[1].point.lng).toBeCloseTo(17.5, 3);
    expect(path.nearestKm(xs[0].point)).toBeCloseTo(xs[0].km, 0);
  });

  it("returns nothing within one region", () => {
    expect(path.crossings(() => "HU")).toEqual([]);
  });
});

describe("decodePolyline precision 6", () => {
  it("decodes Valhalla-style polylines", () => {
    // 38.5,-120.2 at precision 6 is the same digits as precision 5 scaled by 10.
    const p5 = decodePolyline("_p~iF~ps|U");
    const p6 = decodePolyline("_p~iF~ps|U", 6);
    expect(p6[0].lat).toBeCloseTo(p5[0].lat / 10);
  });
});

describe("RoutePath regionsAlong", () => {
  const path = new RoutePath([
    { lat: 47.5, lng: 16 },
    { lat: 47.5, lng: 18 },
  ]); // ~150 km
  it("ignores slivers shorter than the threshold, keeps order", () => {
    // AT for the first half, a 2 km sliver of SK, HU for the rest.
    const region = (p: { lng: number }) => (p.lng < 17 ? "AT" : p.lng < 17.027 ? "SK" : "HU");
    expect(path.regionsAlong(region)).toEqual(["AT", "HU"]);
    expect(path.regionsAlong(region, 1)).toEqual(["AT", "SK", "HU"]);
  });
});

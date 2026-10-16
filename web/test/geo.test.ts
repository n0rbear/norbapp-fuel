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

import { describe, expect, it } from "vitest";
import { RoutePath } from "@/lib/geo";
import { planRuns } from "@/lib/toll-avoid";

// West→east line, AT | HU | SK at lng 16.5 and 17.5 (~75 km per degree here).
const path = new RoutePath([
  { lat: 47.5, lng: 16 },
  { lat: 47.5, lng: 17 },
  { lat: 47.5, lng: 18 },
]);
const countryAt = (p: { lng: number }) => (p.lng < 16.5 ? "AT" : p.lng < 17.5 ? "HU" : "SK");
const start = { lat: 47.5, lng: 16 };
const end = { lat: 47.5, lng: 18 };

describe("planRuns", () => {
  it("returns null when no avoided country is on the route", () => {
    expect(planRuns(path, [start, end], countryAt, new Set())).toBeNull();
    expect(planRuns(path, [start, end], countryAt, new Set(["FR"]))).toBeNull();
  });

  it("re-routes only the avoided country, between its borders", () => {
    const runs = planRuns(path, [start, end], countryAt, new Set(["HU"]))!;
    expect(runs.map((r) => r.avoid)).toEqual([null, "HU", null]);
    const hu = runs[1].boundaries;
    expect(hu.every((b) => b.border)).toBe(true);
    expect(hu[0].point.lng).toBeCloseTo(16.5, 2);
    expect(hu[1].point.lng).toBeCloseTo(17.5, 2);
    // Runs are contiguous: each starts where the previous ended.
    expect(runs[0].boundaries.at(-1)).toBe(runs[1].boundaries[0]);
    expect(runs[1].boundaries.at(-1)).toBe(runs[2].boundaries[0]);
    expect(runs[0].boundaries[0].point).toEqual(start);
    expect(runs[2].boundaries.at(-1)!.point).toEqual(end);
  });

  it("keeps waypoints inside an avoided run", () => {
    const via = { lat: 47.5, lng: 17 };
    const runs = planRuns(path, [start, via, end], countryAt, new Set(["HU"]))!;
    expect(runs[1].boundaries.map((b) => b.border)).toEqual([true, false, true]);
  });

  it("merges neighbouring avoided countries into separate runs", () => {
    const runs = planRuns(path, [start, end], countryAt, new Set(["AT", "HU"]))!;
    expect(runs.map((r) => r.avoid)).toEqual(["AT", "HU", null]);
  });

  it("covers the whole route when everything is avoided", () => {
    const runs = planRuns(path, [start, end], countryAt, new Set(["AT", "HU", "SK"]))!;
    expect(runs[0].boundaries[0].point).toEqual(start);
    expect(runs.at(-1)!.boundaries.at(-1)!.point).toEqual(end);
  });
});

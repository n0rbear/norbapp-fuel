import { describe, expect, it } from "vitest";
import { MAX_WAYPOINTS, parsePlanRequest } from "@/lib/validate";

const valid = {
  origin: { address: "Budapest" },
  destination: "München",
  waypoints: ["Wien", "  ", ""],
  roundTrip: false,
  optimizeWaypoints: true,
  fuelType: "diesel",
  vehicle: { consumption: 7.2, tankSize: 50, startLevelPct: 100, reservePct: 20 },
};

describe("parsePlanRequest", () => {
  it("accepts a valid request and drops blank waypoints", () => {
    const r = parsePlanRequest(valid);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.waypoints).toEqual(["Wien"]);
  });

  it("accepts a coordinate origin", () => {
    expect(parsePlanRequest({ ...valid, origin: { location: { lat: 47.5, lng: 19 } } }).ok).toBe(true);
    expect(parsePlanRequest({ ...valid, origin: { location: { lat: 147.5, lng: 19 } } }).ok).toBe(false);
  });

  it.each([
    ["missing destination", { ...valid, destination: " " }],
    ["unknown fuel", { ...valid, fuelType: "lpg" }],
    ["bad consumption", { ...valid, vehicle: { ...valid.vehicle, consumption: "7" } }],
    ["too many waypoints", { ...valid, waypoints: Array(MAX_WAYPOINTS + 1).fill("x") }],
    ["non-string waypoint", { ...valid, waypoints: [1] }],
    ["not an object", null],
  ])("rejects %s", (_, body) => {
    expect(parsePlanRequest(body).ok).toBe(false);
  });
});

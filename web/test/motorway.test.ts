import { describe, expect, it } from "vitest";
import { isMotorwayRef, motorwayKmByCountry } from "@/lib/motorway";

describe("isMotorwayRef", () => {
  it.each([
    ["FR", "A 6", true],
    ["FR", "N 7", false],
    ["IT", "A1;E 35", true],
    ["HR", "A1", true],
    ["ES", "AP-7", true],
    ["ES", "A-7", false],
    ["IE", "M50", true],
    ["GR", "Α1", true],
    ["FR", null, false],
  ])("%s %s → %s", (country, ref, expected) => {
    expect(isMotorwayRef(country, ref)).toBe(expected);
  });
});

describe("motorwayKmByCountry", () => {
  it("sums motorway steps per country at the step midpoint", () => {
    const at = (lng: number) => ({ lat: 45, lng });
    const countryAt = (p: { lng: number }) => (p.lng < 10 ? "FR" : "IT");
    const steps = [
      { distanceMeters: 300_000, ref: "A 6", midpoint: at(5) },
      { distanceMeters: 20_000, ref: "D 1", midpoint: at(6) },
      { distanceMeters: 150_000, ref: "A4", midpoint: at(12) },
      { distanceMeters: 50_000, ref: "A 43", midpoint: at(7) },
    ];
    expect(motorwayKmByCountry(steps, countryAt)).toEqual({ FR: 350, IT: 150 });
  });
});

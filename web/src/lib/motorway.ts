import type { LatLng } from "./geo";

// Motorway refs per country (OSM `ref` tags as OSRM reports them, e.g. "A 6",
// "AP-7", "A1;E 70"). Only distance-toll countries matter for the estimate;
// Spain tolls the AP network only, Ireland's tolled roads are M roads.
const MOTORWAY_REF: Record<string, RegExp> = {
  ES: /^AP[- ]?\d/,
  IE: /^M ?\d/,
  GR: /^[AΑ] ?\d/,
};
const DEFAULT_MOTORWAY_REF = /^A[- ]?\d/;

export function isMotorwayRef(country: string, ref: string | null): boolean {
  if (!ref) return false;
  const pattern = MOTORWAY_REF[country] ?? DEFAULT_MOTORWAY_REF;
  return ref.split(";").some((r) => pattern.test(r.trim()));
}

/** Sums motorway distance per country, attributing each step to the country at its midpoint. */
export function motorwayKmByCountry(
  steps: { distanceMeters: number; ref: string | null; midpoint: LatLng }[],
  countryAt: (p: LatLng) => string | null,
): Record<string, number> {
  const km: Record<string, number> = {};
  for (const step of steps) {
    const country = countryAt(step.midpoint);
    if (!country || !isMotorwayRef(country, step.ref)) continue;
    km[country] = (km[country] ?? 0) + step.distanceMeters / 1000;
  }
  return km;
}

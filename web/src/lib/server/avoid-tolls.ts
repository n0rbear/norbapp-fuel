import "server-only";
import { countryName } from "../countries";
import { RoutePath, type LatLng } from "../geo";
import { planRuns, type Run } from "../toll-avoid";
import { countryAt, routeAvoidingTolls, routeThrough, type ComputedRoute, type TollFreeRoute } from "./osm";

export type AvoidanceResult = {
  route: ComputedRoute;
  /** Countries whose toll roads were actually avoided. */
  avoided: string[];
  warnings: string[];
};

/**
 * Re-routes the parts of `base` inside the countries in `avoid` over toll-free
 * roads (Valhalla) and keeps the fastest route (OSRM) elsewhere.
 */
export async function applyTollAvoidance(base: ComputedRoute, avoid: ReadonlySet<string>): Promise<AvoidanceResult> {
  const path = new RoutePath(base.points, base.distanceMeters / 1000);
  const runs = planRuns(path, base.waypoints, countryAt, avoid);
  if (!runs) return { route: base, avoided: [], warnings: [] };

  const warnings: string[] = [];

  // 1. Toll-free runs first: their snapped ends become the neighbours' ends.
  const tollFree = await Promise.all(
    runs.map(async (run): Promise<TollFreeRoute | null> => {
      if (!run.avoid) return null;
      try {
        return await routeAvoidingTolls(run.boundaries.map((b) => ({ point: b.point, offMotorway: b.border })));
      } catch {
        warnings.push(`${countryName(run.avoid)}: a fizetős utak elkerülése most nem érhető el, a leggyorsabb úttal számolunk.`);
        return null;
      }
    }),
  );

  // 2. The remaining runs on the fastest route, joined to the toll-free ends.
  const pieces = await Promise.all(
    runs.map(async (run: Run, i): Promise<ComputedRoute | TollFreeRoute> => {
      const free = tollFree[i];
      if (free) {
        if (free.hasToll) warnings.push(`${countryName(run.avoid!)}: a fizetős utakat nem lehetett teljesen elkerülni.`);
        return free;
      }
      const points: LatLng[] = run.boundaries.map((b) => b.point);
      const before = tollFree[i - 1];
      const after = tollFree[i + 1];
      if (before) points[0] = before.points[before.points.length - 1];
      if (after) points[points.length - 1] = after.points[0];
      return routeThrough(points);
    }),
  );

  const route: ComputedRoute = {
    distanceMeters: pieces.reduce((s, p) => s + p.distanceMeters, 0),
    durationSec: pieces.reduce((s, p) => s + p.durationSec, 0),
    points: pieces.flatMap((p, i) => (i === 0 ? p.points : p.points.slice(1))),
    steps: pieces.flatMap((p) => ("steps" in p ? p.steps : [])),
    waypoints: base.waypoints,
  };
  // A toll-free run may cross into a neighbour (Budapest→Vienna without
  // Hungarian motorways passes Slovakia); countries only driven toll-free need
  // no vignette either.
  const tolledCountries = new Set<string>();
  const freeCountries = new Set<string>();
  pieces.forEach((piece, i) => {
    const target = tollFree[i] ? freeCountries : tolledCountries;
    if (piece.points.length < 2) return;
    for (const c of new RoutePath(piece.points).regionsAlong(countryAt)) target.add(c);
  });
  const avoided = [...freeCountries].filter((c) => !tolledCountries.has(c));
  return { route, avoided, warnings };
}

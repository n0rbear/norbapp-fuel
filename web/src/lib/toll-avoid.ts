import type { LatLng, RoutePath } from "./geo";

export type Boundary = {
  km: number;
  point: LatLng;
  /** Border crossing (true) or a place the user asked to visit (false). */
  border: boolean;
};

/** Consecutive part of the route; runs share their end/start boundary. */
export type Run = {
  /** Country whose toll roads are avoided on this run, or null for the fastest route. */
  avoid: string | null;
  boundaries: Boundary[];
};

const MIN_GAP_KM = 0.2;

/**
 * Splits a route at the waypoints and border crossings and groups the pieces
 * into runs: the parts inside countries in `avoid` are re-routed toll-free,
 * the rest keeps the fastest route. Returns null when no avoided country is
 * on the route.
 *
 * Border crossings stay where the fastest route crosses — a simplification:
 * a toll-free route might prefer another crossing.
 */
export function planRuns(
  path: RoutePath,
  waypoints: LatLng[],
  countryAt: (p: LatLng) => string | null,
  avoid: ReadonlySet<string>,
): Run[] | null {
  if (avoid.size === 0 || waypoints.length < 2) return null;

  const stops: Boundary[] = waypoints.map((point, i) => ({
    km: i === 0 ? 0 : i === waypoints.length - 1 ? path.totalKm : path.nearestKm(point),
    point,
    border: false,
  }));
  const borders: Boundary[] = path
    .crossings(countryAt)
    .map((x) => ({ km: x.km, point: x.point, border: true }));

  // Places first, so a border right next to a place is dropped, not the place.
  const boundaries: Boundary[] = [];
  for (const b of [...stops, ...borders].sort((a, b) => a.km - b.km || Number(a.border) - Number(b.border))) {
    const last = boundaries[boundaries.length - 1];
    if (last && b.km - last.km < MIN_GAP_KM) {
      if (last.border && !b.border) boundaries[boundaries.length - 1] = b;
      continue;
    }
    boundaries.push(b);
  }
  // The destination must close the route even if a border sits right before it.
  const end = stops[stops.length - 1];
  if (boundaries[boundaries.length - 1] !== end) boundaries[boundaries.length - 1] = end;

  const runs: Run[] = [];
  for (let i = 1; i < boundaries.length; i++) {
    const from = boundaries[i - 1];
    const to = boundaries[i];
    const country = countryAt(path.pointAtKm((from.km + to.km) / 2));
    const key = country && avoid.has(country) ? country : null;
    const current = runs[runs.length - 1];
    if (current && current.avoid === key) current.boundaries.push(to);
    else runs.push({ avoid: key, boundaries: [from, to] });
  }
  return runs.some((r) => r.avoid !== null) ? runs : null;
}

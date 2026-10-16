export type LatLng = { lat: number; lng: number };

const EARTH_RADIUS_KM = 6371.0088;

/** Decodes an encoded polyline (Google/OSRM precision 5, Valhalla precision 6). */
export function decodePolyline(encoded: string, precision = 5): LatLng[] {
  const factor = 10 ** precision;
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    for (const axis of ["lat", "lng"] as const) {
      let shift = 0;
      let result = 0;
      let byte: number;
      do {
        if (index >= encoded.length) throw new Error("Invalid polyline");
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === "lat") lat += delta;
      else lng += delta;
    }
    points.push({ lat: lat / factor, lng: lng / factor });
  }
  return points;
}

export function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * A path with cumulative distances, scaled so that its total length matches the
 * routing provider's reported distance (the polyline is a simplification).
 */
export class RoutePath {
  readonly points: LatLng[];
  private readonly cumulativeKm: number[];
  readonly totalKm: number;

  constructor(points: LatLng[], reportedTotalKm?: number) {
    if (points.length === 0) throw new Error("Empty route path");
    this.points = points;
    const raw = [0];
    for (let i = 1; i < points.length; i++) {
      raw.push(raw[i - 1] + haversineKm(points[i - 1], points[i]));
    }
    const rawTotal = raw[raw.length - 1];
    const scale = reportedTotalKm && rawTotal > 0 ? reportedTotalKm / rawTotal : 1;
    this.cumulativeKm = raw.map((d) => d * scale);
    this.totalKm = reportedTotalKm ?? rawTotal;
  }

  /** Interpolated position at a given distance from the start. */
  pointAtKm(km: number): LatLng {
    const target = Math.min(Math.max(km, 0), this.totalKm);
    const dist = this.cumulativeKm;
    let lo = 0;
    let hi = dist.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (dist[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    if (lo === 0) return this.points[0];
    const segLen = dist[lo] - dist[lo - 1];
    const t = segLen > 0 ? (target - dist[lo - 1]) / segLen : 0;
    const a = this.points[lo - 1];
    const b = this.points[lo];
    return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
  }

  /** Distance along the path of the point on it closest to `point`. */
  nearestKm(point: LatLng): number {
    // Local equirectangular projection is accurate enough at segment scale.
    const kx = Math.cos((point.lat * Math.PI) / 180);
    let bestKm = 0;
    let bestDist = Infinity;
    for (let i = 1; i < this.points.length; i++) {
      const a = this.points[i - 1];
      const b = this.points[i];
      const dx = (b.lng - a.lng) * kx;
      const dy = b.lat - a.lat;
      const len2 = dx * dx + dy * dy;
      const t = len2 > 0 ? Math.min(1, Math.max(0, (((point.lng - a.lng) * kx) * dx + (point.lat - a.lat) * dy) / len2)) : 0;
      const proj = { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
      const d = haversineKm(point, proj);
      if (d < bestDist) {
        bestDist = d;
        bestKm = this.cumulativeKm[i - 1] + (this.cumulativeKm[i] - this.cumulativeKm[i - 1]) * t;
      }
    }
    return bestKm;
  }

  /**
   * Points where `regionAt` changes along the path, located to within
   * `toleranceKm` by bisection between samples `stepKm` apart.
   */
  crossings<T>(regionAt: (p: LatLng) => T, stepKm = 1, toleranceKm = 0.05): { km: number; point: LatLng; from: T; to: T }[] {
    const result: { km: number; point: LatLng; from: T; to: T }[] = [];
    let prevKm = 0;
    let prev = regionAt(this.pointAtKm(0));
    for (let km = stepKm; prevKm < this.totalKm; km += stepKm) {
      const at = Math.min(km, this.totalKm);
      const current = regionAt(this.pointAtKm(at));
      if (current !== prev) {
        let lo = prevKm;
        let hi = at;
        while (hi - lo > toleranceKm) {
          const mid = (lo + hi) / 2;
          if (regionAt(this.pointAtKm(mid)) === prev) lo = mid;
          else hi = mid;
        }
        result.push({ km: hi, point: this.pointAtKm(hi), from: prev, to: current });
      }
      prev = current;
      prevKm = at;
    }
    return result;
  }

  /**
   * Regions the path runs through for at least `minKm`, in order of first
   * appearance. The threshold hides artefacts of coarse border data, e.g. a
   * riverside road drawn a few km on the wrong side of a river border.
   */
  regionsAlong(regionAt: (p: LatLng) => string | null, minKm = 5, stepKm = 0.5): string[] {
    const count = Math.max(2, Math.ceil(this.totalKm / stepKm) + 1);
    const step = this.totalKm / (count - 1);
    const km = new Map<string, number>();
    for (let i = 0; i < count; i++) {
      const region = regionAt(this.pointAtKm(i * step));
      if (region) km.set(region, (km.get(region) ?? 0) + step);
    }
    return [...km].filter(([, d]) => d >= minKm).map(([region]) => region);
  }

  /** Evenly spaced sample points including both ends, at most `maxSamples`. */
  sample(everyKm: number, maxSamples: number): LatLng[] {
    const count = Math.min(maxSamples, Math.max(2, Math.ceil(this.totalKm / everyKm) + 1));
    const step = this.totalKm / (count - 1);
    return Array.from({ length: count }, (_, i) => this.pointAtKm(i * step));
  }
}

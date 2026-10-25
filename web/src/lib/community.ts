// Community fuel prices: pure rules, shared by the server and the tests.
// All prices here are EUR per litre.

export type Report = { price: number; deviceId: string; ipHash: string; at: number };

/** Two reports agree when they are within this many EUR per litre. */
export const AGREE_EUR = 0.02;
/** Reports this old no longer count towards a consensus. */
export const REPORT_WINDOW_MS = 12 * 3600_000;
/** A confirmed price is shown as "the price at that time" for this long… */
export const CONFIRMED_FRESH_MS = 48 * 3600_000;
/** …and its offset from the average keeps informing estimates for this long. */
export const OFFSET_TTL_MS = 30 * 86_400_000;
/** Nearby confirmed stations within this radius adjust estimates and sanity checks. */
export const NEIGHBOUR_KM = 10;

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * The confirmed price, if at least two different devices on two different
 * connections reported (nearly) the same price within the window. Each device
 * counts once, with its latest report.
 */
export function consensus(reports: Report[], now: number): { price: number; count: number } | null {
  const latest = new Map<string, Report>();
  for (const r of reports) {
    if (now - r.at > REPORT_WINDOW_MS) continue;
    const prev = latest.get(r.deviceId);
    if (!prev || r.at > prev.at) latest.set(r.deviceId, r);
  }
  const candidates = [...latest.values()];
  let best: Report[] = [];
  for (const anchor of candidates) {
    const group = candidates.filter((r) => Math.abs(r.price - anchor.price) <= AGREE_EUR);
    const connections = new Set(group.map((r) => r.ipHash)).size;
    if (connections >= 2 && group.length > best.length) best = group;
  }
  if (best.length < 2) return null;
  return { price: Math.round(median(best.map((r) => r.price)) * 1000) / 1000, count: best.length };
}

/** The most recent report that is not yet confirmed (shown to others to confirm or correct). */
export function pendingReport(reports: Report[], now: number, confirmedAt: number | null): { price: number; count: number } | null {
  const open = reports.filter((r) => now - r.at <= REPORT_WINDOW_MS && (confirmedAt === null || r.at > confirmedAt));
  if (open.length === 0) return null;
  const last = open.reduce((a, b) => (b.at > a.at ? b : a));
  const count = new Set(open.filter((r) => Math.abs(r.price - last.price) <= AGREE_EUR).map((r) => r.deviceId)).size;
  return { price: last.price, count };
}

/**
 * Rejects obvious nonsense: more than 25 % away from the official average
 * estimate, or – when stations nearby have confirmed prices – more than 12 %
 * away from what they suggest.
 */
export function plausible(price: number, baseline: number, nearbySuggestion: number | null): boolean {
  if (!(price > 0.3 && price < 5)) return false;
  if (Math.abs(price - baseline) / baseline > 0.25) return false;
  if (nearbySuggestion !== null && Math.abs(price - nearbySuggestion) / nearbySuggestion > 0.12) return false;
  return true;
}

export type Confirmed = { price: number; baseline: number; confirmedAt: number; reporters: number };
export type Neighbour = { offset: number; distanceKm: number; confirmedAt: number };

export type StationPrice =
  | { kind: "confirmed"; price: number; confirmedAt: number; reporters: number }
  | { kind: "learned"; price: number; confirmedAt: number; reporters: number }
  | { kind: "estimate"; price: number };

/**
 * Today's price for a station without official data.
 * - confirmed in the last 48 h: that price;
 * - confirmed earlier (≤ 30 days): today's average plus the station's own offset;
 * - otherwise: today's average, nudged by confirmed stations nearby
 *   (inverse-distance weighted, shrunk towards zero when there are few).
 */
export function stationPrice(baselineNow: number, own: Confirmed | null, neighbours: Neighbour[], now: number): StationPrice {
  if (own && now - own.confirmedAt <= CONFIRMED_FRESH_MS) {
    return { kind: "confirmed", price: own.price, confirmedAt: own.confirmedAt, reporters: own.reporters };
  }
  if (own && now - own.confirmedAt <= OFFSET_TTL_MS) {
    const price = Math.round((baselineNow + (own.price - own.baseline)) * 1000) / 1000;
    return { kind: "learned", price, confirmedAt: own.confirmedAt, reporters: own.reporters };
  }
  return { kind: "estimate", price: Math.round((baselineNow + neighbourOffset(neighbours, now)) * 1000) / 1000 };
}

/** Weighted offset of nearby confirmed stations from the average (0 without any). */
export function neighbourOffset(neighbours: Neighbour[], now: number): number {
  const usable = neighbours.filter((n) => n.distanceKm <= NEIGHBOUR_KM && now - n.confirmedAt <= OFFSET_TTL_MS);
  if (usable.length === 0) return 0;
  let weighted = 0;
  let weights = 0;
  for (const n of usable) {
    const w = 1 / (1 + n.distanceKm);
    weighted += n.offset * w;
    weights += w;
  }
  // Few neighbours say little about this station: shrink towards the average.
  const shrink = usable.length / (usable.length + 2);
  return (weighted / weights) * shrink;
}

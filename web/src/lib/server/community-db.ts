import "server-only";
import { createHash } from "node:crypto";
import { Pool } from "pg";
import {
  consensus,
  neighbourOffset,
  NEIGHBOUR_KM,
  pendingReport,
  plausible,
  REPORT_WINDOW_MS,
  stationPrice,
  type Confirmed,
  type Neighbour,
  type Report,
  type StationPrice,
} from "../community";
import { haversineKm as distanceKm, type LatLng } from "../geo";

// Community price reports live in the shared NorbApp Postgres, in their own
// "fuel" schema. Without FUEL_DATABASE_URL the feature is read-only (estimates).
const DATABASE_URL = process.env.FUEL_DATABASE_URL || "";
const HASH_SECRET = process.env.FUEL_HASH_SECRET || createHash("sha256").update(`fuel:${DATABASE_URL}`).digest("hex");
const RAW_REPORT_DAYS = 90;

export const communityEnabled = DATABASE_URL !== "";

let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;

function db(): Pool {
  if (!pool) {
    // Render's internal hostnames have no dots and no TLS; external ones need TLS.
    const host = new URL(DATABASE_URL).hostname;
    pool = new Pool({
      connectionString: DATABASE_URL,
      max: 3,
      idleTimeoutMillis: 30_000,
      ssl: host.includes(".") ? { rejectUnauthorized: false } : undefined,
    });
    pool.on("error", (e) => console.warn(`community db: ${e.message}`));
  }
  return pool;
}

function ensureSchema(): Promise<void> {
  schemaReady ??= db()
    .query(
      `CREATE SCHEMA IF NOT EXISTS fuel;
       CREATE TABLE IF NOT EXISTS fuel.price_reports (
         id bigserial PRIMARY KEY,
         station_id text NOT NULL,
         fuel text NOT NULL,
         country text NOT NULL,
         price_eur numeric(6,3) NOT NULL,
         baseline_eur numeric(6,3) NOT NULL,
         lat double precision NOT NULL,
         lng double precision NOT NULL,
         device_id text NOT NULL,
         ip_hash text NOT NULL,
         created_at timestamptz NOT NULL DEFAULT now()
       );
       CREATE INDEX IF NOT EXISTS price_reports_station ON fuel.price_reports (station_id, fuel, created_at DESC);
       CREATE TABLE IF NOT EXISTS fuel.station_prices (
         station_id text NOT NULL,
         fuel text NOT NULL,
         country text NOT NULL,
         price_eur numeric(6,3) NOT NULL,
         baseline_eur numeric(6,3) NOT NULL,
         lat double precision NOT NULL,
         lng double precision NOT NULL,
         reporters integer NOT NULL,
         confirmed_at timestamptz NOT NULL,
         PRIMARY KEY (station_id, fuel)
       );
       CREATE INDEX IF NOT EXISTS station_prices_area ON fuel.station_prices (fuel, lat, lng);`,
    )
    .then(() => undefined)
    .catch((e) => {
      schemaReady = null;
      throw e;
    });
  return schemaReady;
}

/** Anonymous connection fingerprint: a keyed hash, the IP itself is never stored. */
export function hashIp(ip: string): string {
  return createHash("sha256").update(`${HASH_SECRET}:${ip}`).digest("hex").slice(0, 24);
}

type ConfirmedRow = { station_id: string; price_eur: string; baseline_eur: string; lat: number; lng: number; reporters: number; confirmed_at: Date };
type ReportRow = { station_id: string; price_eur: string; device_id: string; ip_hash: string; created_at: Date };

/** Confirmed stations of this fuel within ~NEIGHBOUR_KM of a point. */
async function confirmedNear(fuel: string, point: LatLng, radiusKm: number): Promise<ConfirmedRow[]> {
  const dLat = radiusKm / 111;
  const dLng = radiusKm / (111 * Math.max(0.2, Math.cos((point.lat * Math.PI) / 180)));
  const { rows } = await db().query<ConfirmedRow>(
    `SELECT station_id, price_eur, baseline_eur, lat, lng, reporters, confirmed_at
       FROM fuel.station_prices
      WHERE fuel = $1 AND lat BETWEEN $2 AND $3 AND lng BETWEEN $4 AND $5
        AND confirmed_at > now() - interval '30 days'`,
    [fuel, point.lat - dLat, point.lat + dLat, point.lng - dLng, point.lng + dLng],
  );
  return rows;
}

const toConfirmed = (r: ConfirmedRow): Confirmed => ({
  price: Number(r.price_eur),
  baseline: Number(r.baseline_eur),
  confirmedAt: r.confirmed_at.getTime(),
  reporters: r.reporters,
});

const toReport = (r: ReportRow): Report => ({ price: Number(r.price_eur), deviceId: r.device_id, ipHash: r.ip_hash, at: r.created_at.getTime() });

export type CommunityLookup = {
  price: StationPrice;
  pending: { price: number; count: number } | null;
};

/** Prices (EUR) for stations around a point, from their own reports and their neighbours'. */
export async function lookupStations(
  fuel: string,
  center: LatLng,
  stations: { id: string; location: LatLng }[],
  baselineNow: number,
): Promise<Map<string, CommunityLookup>> {
  const now = Date.now();
  const result = new Map<string, CommunityLookup>();
  const fallback = (): CommunityLookup => ({ price: { kind: "estimate", price: baselineNow }, pending: null });
  if (!communityEnabled || stations.length === 0) {
    for (const s of stations) result.set(s.id, fallback());
    return result;
  }
  await ensureSchema();
  const [confirmed, reports] = await Promise.all([
    confirmedNear(fuel, center, NEIGHBOUR_KM + 10),
    db().query<ReportRow>(
      `SELECT station_id, price_eur, device_id, ip_hash, created_at FROM fuel.price_reports
        WHERE fuel = $1 AND station_id = ANY($2) AND created_at > now() - make_interval(secs => $3)`,
      [fuel, stations.map((s) => s.id), REPORT_WINDOW_MS / 1000],
    ),
  ]);
  const own = new Map(confirmed.map((r) => [r.station_id, r]));
  for (const s of stations) {
    const mine = own.get(s.id);
    const neighbours: Neighbour[] = confirmed
      .filter((r) => r.station_id !== s.id)
      .map((r) => ({
        offset: Number(r.price_eur) - Number(r.baseline_eur),
        distanceKm: distanceKm(s.location, { lat: r.lat, lng: r.lng }),
        confirmedAt: r.confirmed_at.getTime(),
      }));
    const price = stationPrice(baselineNow, mine ? toConfirmed(mine) : null, neighbours, now);
    const stationReports = reports.rows.filter((r) => r.station_id === s.id).map(toReport);
    const pending = pendingReport(stationReports, now, mine ? mine.confirmed_at.getTime() : null);
    result.set(s.id, { price, pending });
  }
  return result;
}

export type NewReport = {
  stationId: string;
  fuel: string;
  country: string;
  priceEur: number;
  baselineEur: number;
  location: LatLng;
  deviceId: string;
  ipHash: string;
};

/** Stores a report; confirms the station's price once enough devices agree. */
export async function addReport(r: NewReport): Promise<"pending" | "confirmed" | "implausible"> {
  await ensureSchema();
  const now = Date.now();
  const near = (await confirmedNear(r.fuel, r.location, NEIGHBOUR_KM)).filter((c) => c.station_id !== r.stationId);
  const suggestion =
    near.length > 0
      ? r.baselineEur +
        neighbourOffset(
          near.map((c) => ({
            offset: Number(c.price_eur) - Number(c.baseline_eur),
            distanceKm: distanceKm(r.location, { lat: c.lat, lng: c.lng }),
            confirmedAt: c.confirmed_at.getTime(),
          })),
          now,
        )
      : null;
  if (!plausible(r.priceEur, r.baselineEur, suggestion)) return "implausible";

  const client = await db().connect();
  try {
    await client.query("BEGIN");
    // One open report per device and station: a new one replaces the old.
    await client.query(
      `DELETE FROM fuel.price_reports WHERE station_id = $1 AND fuel = $2 AND device_id = $3
         AND created_at > now() - make_interval(secs => $4)`,
      [r.stationId, r.fuel, r.deviceId, REPORT_WINDOW_MS / 1000],
    );
    await client.query(
      `INSERT INTO fuel.price_reports (station_id, fuel, country, price_eur, baseline_eur, lat, lng, device_id, ip_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [r.stationId, r.fuel, r.country, r.priceEur.toFixed(3), r.baselineEur.toFixed(3), r.location.lat, r.location.lng, r.deviceId, r.ipHash],
    );
    const current = await client.query<{ confirmed_at: Date }>(
      "SELECT confirmed_at FROM fuel.station_prices WHERE station_id = $1 AND fuel = $2 FOR UPDATE",
      [r.stationId, r.fuel],
    );
    const since = current.rows[0]?.confirmed_at ?? new Date(0);
    const { rows } = await client.query<ReportRow>(
      `SELECT station_id, price_eur, device_id, ip_hash, created_at FROM fuel.price_reports
        WHERE station_id = $1 AND fuel = $2 AND created_at > $3 AND created_at > now() - make_interval(secs => $4)`,
      [r.stationId, r.fuel, since, REPORT_WINDOW_MS / 1000],
    );
    const agreed = consensus(rows.map(toReport), now);
    if (agreed) {
      await client.query(
        `INSERT INTO fuel.station_prices (station_id, fuel, country, price_eur, baseline_eur, lat, lng, reporters, confirmed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
         ON CONFLICT (station_id, fuel) DO UPDATE SET
           price_eur = EXCLUDED.price_eur, baseline_eur = EXCLUDED.baseline_eur, reporters = EXCLUDED.reporters,
           lat = EXCLUDED.lat, lng = EXCLUDED.lng, confirmed_at = EXCLUDED.confirmed_at`,
        [r.stationId, r.fuel, r.country, agreed.price.toFixed(3), r.baselineEur.toFixed(3), r.location.lat, r.location.lng, agreed.count],
      );
    }
    await client.query("COMMIT");
    // Raw reports are only needed for a while; confirmed prices keep the result.
    if (Math.random() < 0.02) {
      void db()
        .query(`DELETE FROM fuel.price_reports WHERE created_at < now() - make_interval(days => $1)`, [RAW_REPORT_DAYS])
        .catch(() => {});
    }
    return agreed ? "confirmed" : "pending";
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

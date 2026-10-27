import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Reader } from "mmdb-lib";
import { formatCity, type GeoLiteCity } from "@/lib/notify-message";

// Visitor place for the owner's notifications (owner request 2026-10-27):
//  - city: MaxMind GeoLite web service (https://geolite.info, free, 1000
//    look-ups a day) when MAXMIND_ACCOUNT_ID and MAXMIND_LICENSE_KEY are set;
//    answers are kept in memory for a day per IP, and the daily budget stops
//    a little below the limit;
//  - otherwise, or when that fails: country from the DB-IP "IP to Country
//    Lite" database (CC BY 4.0, https://db-ip.com), in memory (~8 MB).
// The IP is neither stored on disk nor logged.
// DB-IP records are flat ({ country_code }), unlike MaxMind's typed responses.
type CountryRecord = { country_code?: string };
const openReader = (data: Buffer) => new Reader(data);
let reader: ReturnType<typeof openReader> | null | undefined;

function db(): ReturnType<typeof openReader> | null {
  if (reader === undefined) {
    try {
      // Built at run time so the bundler leaves the binary file alone.
      const parts = ["node_modules", "@ip-location-db", "dbip-country-mmdb", "dbip-country.mmdb"];
      const file = join(/*turbopackIgnore: true*/ process.cwd(), ...parts);
      reader = openReader(readFileSync(file));
    } catch (e) {
      console.warn(`geo: country database unavailable (${e instanceof Error ? e.message : e})`);
      reader = null;
    }
  }
  return reader;
}

const PRIVATE = /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|f[cd]|fe80:)/i;
const names = new Intl.DisplayNames(["hu"], { type: "region" });

/** The visitor's country in Hungarian ("Magyarország"), or null when unknown. */
export function countryOf(ip: string): string | null {
  const address = ip.trim().replace(/^::ffff:/i, "");
  if (!address || PRIVATE.test(address)) return null;
  try {
    const code = (db()?.get(address) as unknown as CountryRecord | null | undefined)?.country_code;
    if (!code || !/^[A-Z]{2}$/.test(code)) return null;
    return names.of(code) ?? code;
  } catch {
    return null;
  }
}

// ── City (MaxMind GeoLite web service) ──────────────────────────────────────

const ACCOUNT = process.env.MAXMIND_ACCOUNT_ID?.trim() ?? "";
const LICENSE = process.env.MAXMIND_LICENSE_KEY?.trim() ?? "";
const DAILY_BUDGET = 950; // the free service allows 1000 a day
const CACHE_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 5000;

const cache = new Map<string, { at: number; place: string | null }>();
let budget = { day: "", used: 0 };
let pausedUntil = 0;

async function cityOf(address: string): Promise<string | null | undefined> {
  if (!ACCOUNT || !LICENSE || Date.now() < pausedUntil) return undefined;
  const hit = cache.get(address);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.place;
  const day = new Date().toISOString().slice(0, 10);
  if (budget.day !== day) budget = { day, used: 0 };
  if (budget.used >= DAILY_BUDGET) return undefined;
  budget.used++;
  try {
    const res = await fetch(`https://geolite.info/geoip/v2.1/city/${encodeURIComponent(address)}`, {
      headers: { authorization: `Basic ${Buffer.from(`${ACCOUNT}:${LICENSE}`).toString("base64")}`, accept: "application/json" },
      signal: AbortSignal.timeout(4000),
    });
    if (res.status === 401 || res.status === 402 || res.status === 403 || res.status === 429) {
      // Wrong key, quota used up on MaxMind's side, or throttled: country only for an hour
      console.warn(`geo: GeoLite answered ${res.status}, using the country database for an hour`);
      pausedUntil = Date.now() + 60 * 60 * 1000;
      return undefined;
    }
    const place = res.ok ? formatCity((await res.json()) as GeoLiteCity) : null;
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
    cache.set(address, { at: Date.now(), place });
    return place;
  } catch {
    return undefined;
  }
}

/** The visitor's city and country ("Budapest, Magyarország"), or country, or null. */
export async function placeOf(ip: string): Promise<string | null> {
  const address = ip.trim().replace(/^::ffff:/i, "");
  if (!address || PRIVATE.test(address)) return null;
  const city = await cityOf(address);
  return city === undefined ? countryOf(address) : (city ?? countryOf(address));
}


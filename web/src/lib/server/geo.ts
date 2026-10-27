import "server-only";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Reader } from "mmdb-lib";

// Visitor country for the owner's notifications: IP → country from the DB-IP
// "IP to Country Lite" database (CC BY 4.0, https://db-ip.com), looked up in
// memory. The IP is neither stored nor logged. Loaded on first use (~8 MB).
type CountryRecord = { country_code?: string };
let reader: Reader<CountryRecord> | null | undefined;

function db(): Reader<CountryRecord> | null {
  if (reader === undefined) {
    try {
      const file = createRequire(import.meta.url).resolve("@ip-location-db/dbip-country-mmdb/dbip-country.mmdb");
      reader = new Reader<CountryRecord>(readFileSync(file));
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
    const code = db()?.get(address)?.country_code;
    if (!code || !/^[A-Z]{2}$/.test(code)) return null;
    return names.of(code) ?? code;
  } catch {
    return null;
  }
}

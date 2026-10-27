import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Reader } from "mmdb-lib";

// Visitor country for the owner's notifications: IP → country from the DB-IP
// "IP to Country Lite" database (CC BY 4.0, https://db-ip.com), looked up in
// memory. The IP is neither stored nor logged. Loaded on first use (~8 MB).
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

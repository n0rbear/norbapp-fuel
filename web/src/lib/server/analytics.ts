import "server-only";
import { createHash } from "node:crypto";
import { communityEnabled, db, ensureSchema } from "./community-db";
import { clientKey } from "./rate-limit";

// Anonymous usage statistics for /stat. No cookies, no IP addresses, no
// addresses typed by the user: each event stores its type, a few properties
// and a visitor code that changes every day (a keyed hash of IP, browser and
// date), so unique visitors can be counted per day but not followed.
const SECRET = process.env.FUEL_HASH_SECRET || createHash("sha256").update(`stats:${process.env.FUEL_DATABASE_URL ?? ""}`).digest("hex");
const KEEP_DAYS = 400;

export type EventData = Record<string, string | number | boolean | null | string[]>;

function visitorCode(request: Request): string {
  const day = new Date().toISOString().slice(0, 10);
  const ua = request.headers.get("user-agent") ?? "";
  return createHash("sha256").update(`${SECRET}:${day}:${clientKey(request)}:${ua}`).digest("hex").slice(0, 16);
}

/** Device class, OS and browser family from the User-Agent (the string itself is not stored). */
export function classifyUserAgent(ua: string): { device: string; os: string; browser: string; bot: boolean } {
  const bot = /bot|crawler|spider|preview|headless|curl|wget|python|monitor|uptime/i.test(ua);
  const ipad = /iPad/.test(ua) || (/Macintosh/.test(ua) && /Mobile/.test(ua));
  const device = ipad || /Tablet/i.test(ua) ? "tablet" : /Mobi|iPhone|Android.+Mobile/i.test(ua) ? "mobile" : "desktop";
  const os = /iPhone|iPad|iPod/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Mac OS X|Macintosh/.test(ua)
        ? "macOS"
        : /Windows/.test(ua)
          ? "Windows"
          : /CrOS/.test(ua)
            ? "ChromeOS"
            : /Linux/.test(ua)
              ? "Linux"
              : "other";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /SamsungBrowser/.test(ua)
      ? "Samsung Internet"
      : /OPR\/|Opera/.test(ua)
        ? "Opera"
        : /Firefox|FxiOS/.test(ua)
          ? "Firefox"
          : /Chrome|CriOS/.test(ua)
            ? "Chrome"
            : /Safari/.test(ua)
              ? "Safari"
              : "other";
  return { device, os, browser, bot };
}

/** Records an event in the background; never throws and never delays the response. */
export function track(request: Request, type: string, data: EventData = {}): void {
  if (!communityEnabled) return;
  const ua = classifyUserAgent(request.headers.get("user-agent") ?? "");
  if (ua.bot) return;
  const payload = { ...data, device: ua.device, os: ua.os, browser: ua.browser };
  const visitor = visitorCode(request);
  void ensureSchema()
    .then(() => db().query("INSERT INTO fuel.events (type, visitor, data) VALUES ($1, $2, $3)", [type, visitor, JSON.stringify(payload)]))
    .then(() => {
      if (Math.random() < 0.002) {
        return db().query("DELETE FROM fuel.events WHERE at < now() - make_interval(days => $1)", [KEEP_DAYS]);
      }
    })
    .catch((e) => console.warn(`analytics: ${e instanceof Error ? e.message : e}`));
}

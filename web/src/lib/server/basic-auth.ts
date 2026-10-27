import "server-only";
import { timingSafeEqual } from "node:crypto";

// The owner's login (STATS_USER / STATS_PASSWORD), used by /stat and the
// notification settings. Both empty means the protected pages do not exist.
export const OWNER_USER = process.env.STATS_USER || "";
export const OWNER_PASSWORD = process.env.STATS_PASSWORD || "";
export const ownerLoginConfigured = OWNER_USER !== "" && OWNER_PASSWORD !== "";

export function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Basic Auth with the owner's login. */
export function isOwner(request: Request): boolean {
  if (!ownerLoginConfigured) return false;
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Basic ")) return false;
  const [user, ...rest] = Buffer.from(header.slice(6), "base64").toString("utf8").split(":");
  return same(user, OWNER_USER) && same(rest.join(":"), OWNER_PASSWORD);
}

export function loginRequired(realm: string): Response {
  return new Response("Bejelentkezés szükséges", {
    status: 401,
    headers: { "WWW-Authenticate": `Basic realm="${realm}", charset="UTF-8"`, "X-Robots-Tag": "noindex" },
  });
}

import { track, type EventData } from "@/lib/server/analytics";
import { clientKey, RateLimiter } from "@/lib/server/rate-limit";

// Browser-side usage events (page views, install prompt, navigation clicks,
// language changes) for /stat. Only whitelisted, short fields are kept.
const limiter = new RateLimiter(60, 60);
const TYPES = new Set(["pageview", "install_shown", "install_accepted", "install_dismissed", "nav", "language"]);
const FIELDS: Record<string, "string" | "boolean"> = {
  path: "string",
  locale: "string",
  standalone: "boolean",
  referrer: "string",
  app: "string",
  from: "string",
  to: "string",
  mode: "string",
};

export async function POST(request: Request) {
  if (!limiter.take(clientKey(request))) return new Response(null, { status: 204 });
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(await request.text()) as Record<string, unknown>;
  } catch {
    return new Response(null, { status: 204 });
  }
  const type = String(body.type ?? "");
  if (!TYPES.has(type)) return new Response(null, { status: 204 });
  const data: EventData = {};
  for (const [key, kind] of Object.entries(FIELDS)) {
    const v = body[key];
    if (kind === "boolean" && typeof v === "boolean") data[key] = v;
    if (kind === "string" && typeof v === "string" && v !== "") data[key] = v.slice(0, 60);
  }
  track(request, type, data);
  return new Response(null, { status: 204 });
}

import { connection } from "next/server";
import { parseHubEvent } from "@/lib/notify-message";
import { same } from "@/lib/server/basic-auth";
import { sendNotification } from "@/lib/server/notify";
import { clientKey, RateLimiter } from "@/lib/server/rate-limit";

// Events from the other NorbApp sites (Keto Mentor, Spiribook, …):
//   POST /api/notify  Authorization: Bearer <NOTIFY_HUB_TOKEN>
//   { site, siteLabel, event, label, default, title?, message, tags?, click? }
// The notification goes out only while that event's switch is on.
const TOKEN = process.env.NOTIFY_HUB_TOKEN || "";
const limiter = new RateLimiter(120, 120);

export async function POST(request: Request) {
  await connection();
  if (!TOKEN) return new Response("Not found", { status: 404 });
  const auth = request.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ") || !same(auth.slice(7), TOKEN)) return new Response(null, { status: 401 });
  if (!limiter.take(clientKey(request))) return Response.json({ error: "rate_limited" }, { status: 429 });
  let body: unknown;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return Response.json({ error: "json" }, { status: 400 });
  }
  const parsed = parseHubEvent(body);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
  const sent = await sendNotification(parsed.value);
  return Response.json({ sent }, { headers: { "Cache-Control": "no-store" } });
}

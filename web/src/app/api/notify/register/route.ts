import { connection } from "next/server";
import { parseCatalog } from "@/lib/notify-message";
import { same } from "@/lib/server/basic-auth";
import { communityEnabled } from "@/lib/server/community-db";
import { registerCatalog } from "@/lib/server/notify";

// A NorbApp site announces all its event types at startup, so the owner can
// switch each one before it ever happens:
//   POST /api/notify/register  Authorization: Bearer <NOTIFY_HUB_TOKEN>
//   { site, siteLabel, events: [{ event, label, default }] }
// Existing switches keep their state; only labels are refreshed.
const TOKEN = process.env.NOTIFY_HUB_TOKEN || "";

export async function POST(request: Request) {
  await connection();
  if (!TOKEN) return new Response("Not found", { status: 404 });
  const auth = request.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ") || !same(auth.slice(7), TOKEN)) return new Response(null, { status: 401 });
  if (!communityEnabled) return Response.json({ error: "no_database" }, { status: 503 });
  let body: unknown;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return Response.json({ error: "json" }, { status: 400 });
  }
  const parsed = parseCatalog(body);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
  const count = await registerCatalog(parsed.value.site, parsed.value.siteLabel, parsed.value.events);
  return Response.json({ registered: count }, { headers: { "Cache-Control": "no-store" } });
}

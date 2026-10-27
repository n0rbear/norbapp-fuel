import { connection } from "next/server";
import { switchDisplay, switchKey, type Switch } from "@/lib/notify-message";
import { isOwner, loginRequired, ownerLoginConfigured } from "@/lib/server/basic-auth";
import { communityEnabled } from "@/lib/server/community-db";
import { listSwitches, setSwitch } from "@/lib/server/notify";

// Notification switches for the owner's iPhone shortcut (Basic Auth with the
// /stat login):
//   GET  → { lines: [display…], menu: { display: key }, items: [{ key, display, enabled, … }] }
//        (lines keeps the order: everything, then per site its own switch first)
//   POST { keys: […] } flips those switches; each is a key ("fuel/plan") or a
//        shown line, as a list or one per line. { key, enabled } sets one.
//        Answers { changed: [display…], lines, menu, items }.
const NO_STORE = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
const view = (s: Switch) => ({ key: switchKey(s), display: switchDisplay(s), ...s });
const payload = (list: Switch[]) => ({ lines: list.map(switchDisplay), menu: Object.fromEntries(list.map((s) => [switchDisplay(s), switchKey(s)])), items: list.map(view) });

async function guard(request: Request): Promise<Response | null> {
  await connection();
  if (!ownerLoginConfigured) return new Response("Not found", { status: 404 });
  if (!isOwner(request)) return loginRequired("NorbApp notifications");
  if (!communityEnabled) return Response.json({ error: "no_database" }, { status: 503 });
  return null;
}

export async function GET(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;
  return Response.json(payload(await listSwitches()), { headers: NO_STORE });
}

export async function POST(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(await request.text()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "json" }, { status: 400 });
  }
  // Shortcuts may send a list as one text with a key per line.
  const raw = Array.isArray(body.keys) ? body.keys : typeof body.keys === "string" ? body.keys.split(/\r?\n/) : typeof body.key === "string" ? [body.key] : [];
  const keys = raw.filter((k): k is string => typeof k === "string").map((k) => k.trim()).filter(Boolean).slice(0, 100);
  if (keys.length === 0) return Response.json({ error: "keys" }, { status: 400 });
  const enabled = typeof body.enabled === "boolean" ? body.enabled : undefined;
  const changed: string[] = [];
  for (const key of keys) {
    const s = await setSwitch(key, enabled);
    if (s) changed.push(switchDisplay(s));
  }
  return Response.json({ changed, ...payload(await listSwitches()) }, { headers: NO_STORE });
}

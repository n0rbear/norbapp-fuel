import "server-only";
import { DEFAULT_NOTIFY_EVENTS, notifyMessage } from "@/lib/notify-message";
import { RateLimiter } from "./rate-limit";

// Push notifications about usage events through ntfy (https://ntfy.sh): set
// NTFY_URL to https://ntfy.sh/<secret-topic> and subscribe to that topic in
// the ntfy app. NOTIFY_EVENTS (comma-separated) picks the event types;
// NTFY_TOKEN is only needed for a protected topic. At most ~30 per hour.
const URL_ = process.env.NTFY_URL || "";
const TOKEN = process.env.NTFY_TOKEN || "";
const EVENTS = new Set(
  (process.env.NOTIFY_EVENTS || DEFAULT_NOTIFY_EVENTS.join(","))
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);
const limiter = new RateLimiter(30, 0.5);

/** Sends a notification in the background; never throws and never delays the response. */
export function notify(type: string, data: Record<string, unknown>): void {
  if (!URL_ || !EVENTS.has(type)) return;
  const msg = notifyMessage(type, data);
  if (!msg || !limiter.take("ntfy")) return;
  let server: string;
  let topic: string;
  try {
    const u = new URL(URL_);
    server = u.origin;
    topic = u.pathname.replace(/^\/+|\/+$/g, "");
  } catch {
    console.warn("notify: invalid NTFY_URL");
    return;
  }
  void fetch(server, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) },
    body: JSON.stringify({ topic, ...msg, click: "https://fuel.norbapp.com/stat?days=1" }),
    signal: AbortSignal.timeout(5000),
  })
    .then((r) => {
      if (!r.ok) console.warn(`notify: ntfy answered ${r.status}`);
    })
    .catch((e) => console.warn(`notify: ${e instanceof Error ? e.message : e}`));
}

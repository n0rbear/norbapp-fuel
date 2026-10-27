import "server-only";
import {
  allowed,
  FUEL_EVENTS,
  fuelNotice,
  sortSwitches,
  switchKey,
  type Notice,
  type Switch,
} from "@/lib/notify-message";
import { communityEnabled, db } from "./community-db";
import { RateLimiter } from "./rate-limit";

// NorbApp notification hub. Fuel's own usage events and events posted by the
// other NorbApp sites (/api/notify) go out as ntfy push notifications
// (NTFY_URL = https://ntfy.sh/<secret-topic>) when their switch is on.
// Switches live in the shared Postgres (schema "notify"): every event type
// appears there the first time it happens, on or off as its sender proposes,
// and the owner flips them from the iPhone shortcut (/api/notify/settings).
const NTFY_URL = process.env.NTFY_URL || "";
const NTFY_TOKEN = process.env.NTFY_TOKEN || "";
const CACHE_MS = 15_000;
const limiter = new RateLimiter(60, 1); // at most ~60 notifications per hour

let schemaReady: Promise<void> | null = null;
let cache: { at: number; rows: Map<string, Switch> } | null = null;

function ensureNotifySchema(): Promise<void> {
  schemaReady ??= db()
    .query(
      `CREATE SCHEMA IF NOT EXISTS notify;
       CREATE TABLE IF NOT EXISTS notify.switches (
         site text NOT NULL,
         event text NOT NULL,
         site_label text NOT NULL,
         label text NOT NULL,
         enabled boolean NOT NULL,
         updated_at timestamptz NOT NULL DEFAULT now(),
         PRIMARY KEY (site, event)
       );
       INSERT INTO notify.switches (site, event, site_label, label, enabled)
       VALUES ('*', '*', 'Mind', 'Minden értesítés', true) ON CONFLICT DO NOTHING;`,
    )
    .then(() => undefined)
    .catch((e) => {
      schemaReady = null;
      throw e;
    });
  return schemaReady;
}

async function switches(): Promise<Map<string, Switch>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.rows;
  await ensureNotifySchema();
  const { rows } = await db().query("SELECT site, event, site_label, label, enabled FROM notify.switches");
  const map = new Map<string, Switch>();
  for (const r of rows as Array<Record<string, unknown>>) {
    const s: Switch = { site: String(r.site), event: String(r.event), siteLabel: String(r.site_label), label: String(r.label), enabled: Boolean(r.enabled) };
    map.set(switchKey(s), s);
  }
  cache = { at: Date.now(), rows: map };
  return map;
}

const enabledMap = (map: Map<string, Switch>) => new Map<string, boolean>([...map].map(([k, s]): [string, boolean] => [k, s.enabled]));

/** Adds an event type the first time it is seen; its switch then decides. */
async function isOn(site: string, siteLabel: string, event: string, label: string, on: boolean): Promise<boolean> {
  if (!communityEnabled) return on;
  const map = await switches();
  const key = switchKey({ site, event });
  if (!map.has(key)) {
    await db().query(
      `INSERT INTO notify.switches (site, event, site_label, label, enabled) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (site, event) DO UPDATE SET site_label = EXCLUDED.site_label, label = EXCLUDED.label`,
      [site, event, siteLabel, label, on],
    );
    cache = null;
    return allowed(enabledMap(await switches()), site, event);
  }
  return allowed(enabledMap(map), site, event);
}

function post(notice: Notice): Promise<void> {
  const u = new URL(NTFY_URL);
  return fetch(u.origin, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(NTFY_TOKEN ? { Authorization: `Bearer ${NTFY_TOKEN}` } : {}) },
    body: JSON.stringify({ topic: u.pathname.replace(/^\/+|\/+$/g, ""), ...notice }),
    signal: AbortSignal.timeout(5000),
  }).then((r) => {
    if (!r.ok) throw new Error(`ntfy answered ${r.status}`);
  });
}

export const hubEnabled = () => NTFY_URL !== "";

/** Sends one notification if its switch is on. Resolves to whether it went out; never throws. */
export async function sendNotification(e: { site: string; siteLabel: string; event: string; label: string; on: boolean; notice: Notice }): Promise<boolean> {
  if (!hubEnabled()) return false;
  try {
    let on: boolean;
    try {
      on = await isOn(e.site, e.siteLabel, e.event, e.label, e.on);
    } catch (err) {
      console.warn(`notify: switches unavailable (${err instanceof Error ? err.message : err}), using default`);
      on = e.on;
    }
    if (!on || !limiter.take("ntfy")) return false;
    await post({ ...e.notice, title: `${e.siteLabel} · ${e.notice.title}` });
    return true;
  } catch (err) {
    console.warn(`notify: ${err instanceof Error ? err.message : err}`);
    return false;
  }
}

/** Fuel's own usage events (called from analytics.track). */
export function notify(type: string, data: Record<string, unknown>): void {
  if (!hubEnabled()) return;
  const known = FUEL_EVENTS[type];
  void sendNotification({
    site: "fuel",
    siteLabel: "Fuel",
    event: type,
    label: known?.label ?? type,
    on: known?.on ?? false,
    notice: { ...fuelNotice(type, data), click: "https://fuel.norbapp.com/stat?days=1" },
  });
}

/** All switches, master first. */
export async function listSwitches(): Promise<Switch[]> {
  return sortSwitches([...(await switches()).values()]);
}

/** Sets a switch, or flips it when enabled is omitted. Null when the key is unknown. */
export async function setSwitch(key: string, enabled?: boolean): Promise<Switch | null> {
  const slash = key.indexOf("/");
  if (slash < 1) return null;
  const site = key.slice(0, slash);
  const event = key.slice(slash + 1);
  await ensureNotifySchema();
  const { rows } = await db().query(
    `UPDATE notify.switches SET enabled = COALESCE($3, NOT enabled), updated_at = now()
      WHERE site = $1 AND event = $2 RETURNING site, event, site_label, label, enabled`,
    [site, event, enabled ?? null],
  );
  cache = null;
  const r = rows[0] as Record<string, unknown> | undefined;
  return r ? { site: String(r.site), event: String(r.event), siteLabel: String(r.site_label), label: String(r.label), enabled: Boolean(r.enabled) } : null;
}

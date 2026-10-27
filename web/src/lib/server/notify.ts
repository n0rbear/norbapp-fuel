import "server-only";
import {
  ALL,
  allowed,
  FUEL_EVENTS,
  fuelNotice,
  resolveSwitch,
  sortSwitches,
  switchKey,
  type CatalogEntry,
  type Notice,
  type Switch,
  withPlace,
} from "@/lib/notify-message";
import { countryOf } from "./geo";
import { communityEnabled, db } from "./community-db";
import { RateLimiter } from "./rate-limit";

// NorbApp notification hub. Fuel's own usage events and events posted by the
// other NorbApp sites (/api/notify) go out as ntfy push notifications
// (NTFY_URL = https://ntfy.sh/<secret-topic>) when their switch is on.
// Switches live in the shared Postgres (schema "notify"): each site registers
// all its event types at startup (/api/notify/register; Fuel's own below),
// unknown ones are added the first time they happen, on or off as the sender
// proposes, and the owner flips them from the iPhone shortcut
// (/api/notify/settings). "*/*" mutes everything, "<site>/*" one site.
const NTFY_URL = process.env.NTFY_URL || "";
const NTFY_TOKEN = process.env.NTFY_TOKEN || "";
const CACHE_MS = 15_000;
// Each event type has its own hourly budget (~30), so a burst of page views
// cannot crowd out a sign-up or a payment; all together at most ~150 an hour.
const perEvent = new RateLimiter(30, 0.5);
const overall = new RateLimiter(150, 2.5);
const withinBudget = (key: string) => perEvent.take(key) && overall.take("all");

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
    .then(() =>
      upsertCatalog(
        "fuel",
        "Fuel",
        Object.entries(FUEL_EVENTS).map(([event, e]) => ({ event, label: e.label, on: e.on })),
      ),
    )
    .then(() => oneTimeChanges())
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

/**
 * Switch changes the owner asked for that must run exactly once (they would
 * otherwise undo the owner's later choices on every restart).
 */
const ONE_TIME: Array<{ id: string; sql: string }> = [
  {
    // 2026-10-27: owner wants page views and logins on every site, switchable later.
    id: "2026-10-27-pageviews-logins-on",
    sql: `UPDATE notify.switches SET enabled = true, updated_at = now()
           WHERE (site, event) IN (('fuel', 'pageview'), ('keto', 'login'), ('keto', 'pageview'), ('spiribook', 'user.login'), ('spiribook', 'page.view'))`,
  },
];

async function oneTimeChanges(): Promise<void> {
  await db().query("CREATE TABLE IF NOT EXISTS notify.applied (id text PRIMARY KEY, at timestamptz NOT NULL DEFAULT now())");
  for (const change of ONE_TIME) {
    const { rowCount } = await db().query("INSERT INTO notify.applied (id) VALUES ($1) ON CONFLICT DO NOTHING", [change.id]);
    if (rowCount) await db().query(change.sql);
  }
}

/** Adds missing event types (and the site's own switch) without touching existing switches. */
async function upsertCatalog(site: string, siteLabel: string, events: CatalogEntry[]): Promise<void> {
  const rows: CatalogEntry[] = [{ event: ALL, label: "Az oldal összes értesítése", on: true }, ...events];
  const params: unknown[] = [];
  const values = rows.map((e, i) => {
    params.push(site, e.event, siteLabel, e.label, e.on);
    const o = i * 5;
    return `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5})`;
  });
  await db().query(
    `INSERT INTO notify.switches (site, event, site_label, label, enabled) VALUES ${values.join(", ")}
     ON CONFLICT (site, event) DO UPDATE SET site_label = EXCLUDED.site_label, label = EXCLUDED.label`,
    params,
  );
  cache = null;
}

/** A site's full list of event types, so every switch exists before its first event. */
export async function registerCatalog(site: string, siteLabel: string, events: CatalogEntry[]): Promise<number> {
  await ensureNotifySchema();
  await upsertCatalog(site, siteLabel, events);
  return events.length;
}

const enabledMap = (map: Map<string, Switch>) => new Map<string, boolean>([...map].map(([k, s]): [string, boolean] => [k, s.enabled]));

/** Adds an event type the first time it is seen; its switch then decides. */
async function isOn(site: string, siteLabel: string, event: string, label: string, on: boolean): Promise<boolean> {
  if (!communityEnabled) return on;
  const map = await switches();
  const key = switchKey({ site, event });
  if (!map.has(key)) {
    await upsertCatalog(site, siteLabel, [{ event, label, on }]);
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
export async function sendNotification(e: { site: string; siteLabel: string; event: string; label: string; on: boolean; notice: Notice; ip?: string }): Promise<boolean> {
  if (!hubEnabled()) return false;
  try {
    let on: boolean;
    try {
      on = await isOn(e.site, e.siteLabel, e.event, e.label, e.on);
    } catch (err) {
      console.warn(`notify: switches unavailable (${err instanceof Error ? err.message : err}), using default`);
      on = e.on;
    }
    if (!on || !withinBudget(`${e.site}/${e.event}`)) return false;
    // The visitor's country (from the IP, looked up in memory; the IP is not kept).
    const message = withPlace(e.notice.message, e.ip ? countryOf(e.ip) : null);
    await post({ ...e.notice, message, title: `${e.siteLabel} · ${e.notice.title}` });
    return true;
  } catch (err) {
    console.warn(`notify: ${err instanceof Error ? err.message : err}`);
    return false;
  }
}

/**
 * Confirms the owner's own switch change. Goes out even when everything is
 * muted (the owner asked for it), but still within the hourly cap.
 */
export async function confirmSwitchChange(changed: string[]): Promise<boolean> {
  if (!hubEnabled() || changed.length === 0 || !withinBudget("owner/switch")) return false;
  try {
    await post({
      title: "NorbApp · Értesítések módosítva",
      message: changed.join("\n"),
      tags: ["gear"],
    });
    return true;
  } catch (err) {
    console.warn(`notify: ${err instanceof Error ? err.message : err}`);
    return false;
  }
}

/** Fuel's own usage events (called from analytics.track). */
export function notify(type: string, data: Record<string, unknown>, ip?: string): void {
  if (!hubEnabled()) return;
  const known = FUEL_EVENTS[type];
  void sendNotification({
    site: "fuel",
    siteLabel: "Fuel",
    event: type,
    label: known?.label ?? type,
    on: known?.on ?? false,
    notice: { ...fuelNotice(type, data), click: "https://fuel.norbapp.com/stat?days=1" },
    ip,
  });
}

/** All switches, master first. */
export async function listSwitches(): Promise<Switch[]> {
  return sortSwitches([...(await switches()).values()]);
}

/** Sets a switch, or flips it when enabled is omitted. Takes its key or its shown text; null when unknown. */
export async function setSwitch(picked: string, enabled?: boolean): Promise<Switch | null> {
  const key = resolveSwitch([...(await switches()).values()], picked);
  if (!key) return null;
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

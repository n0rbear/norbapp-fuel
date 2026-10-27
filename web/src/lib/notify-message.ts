// Notification texts and the switch list of the NorbApp notification hub
// (lib/server/notify.ts). Pure functions, tested in test/notify.test.ts.

type Data = Record<string, unknown>;

export type Notice = { title: string; message: string; tags?: string[]; click?: string };

/** Fuel's usage events: switch label and whether it is on until changed. */
export const FUEL_EVENTS: Record<string, { label: string; on: boolean }> = {
  plan: { label: "Új kalkuláció", on: true },
  plan_error: { label: "Hibás kalkuláció", on: true },
  report: { label: "Ár-jelzés", on: true },
  install_accepted: { label: "App telepítés", on: true },
  install_dismissed: { label: "Telepítés elutasítva", on: false },
  install_shown: { label: "Telepítési ajánlat megjelent", on: false },
  tolls: { label: "Útdíj-lekérdezés", on: false },
  stations: { label: "Kútlista-lekérdezés", on: false },
  nav: { label: "Navigáció-kattintás", on: false },
  language: { label: "Nyelvváltás", on: false },
  pageview: { label: "Oldalmegtekintés", on: false },
};

const DEVICE: Record<string, string> = { mobile: "telefon", tablet: "tablet", desktop: "számítógép" };
const STATUS: Record<string, string> = { pending: "függőben", confirmed: "megerősítve", implausible: "elutasítva" };

const device = (d: Data) => [DEVICE[String(d.device)] ?? d.device, d.os].filter(Boolean).join(", ");
const lines = (...l: unknown[]) => l.filter(Boolean).join("\n");
const km = (v: unknown) => `${Number(v ?? 0).toLocaleString("hu-HU")} km`;

/** Text for a Fuel usage event. */
export function fuelNotice(type: string, d: Data): Notice {
  const label = FUEL_EVENTS[type]?.label ?? type;
  switch (type) {
    case "plan": {
      const route = Array.isArray(d.countries) && d.countries.length > 0 ? d.countries.join(" → ") : `${d.from ?? "?"} → ${d.to ?? "?"}`;
      const extra = [
        km(d.km),
        `${d.stops ?? 0} tankolás`,
        d.fuel,
        d.roundTrip ? "oda-vissza" : null,
        Number(d.waypoints) > 0 ? `${d.waypoints} köztes megálló` : null,
      ].filter(Boolean);
      return { title: label, message: lines(route, extra.join(" · "), device(d)), tags: ["fuelpump"] };
    }
    case "plan_error":
      return { title: label, message: lines(`Hibakód: ${d.code ?? "ismeretlen"}`, device(d)), tags: ["warning"] };
    case "report":
      return { title: label, message: lines(`${d.country ?? "?"} · ${d.fuel ?? "?"} · ${STATUS[String(d.status)] ?? d.status}`, device(d)), tags: ["moneybag"] };
    case "install_accepted":
      return { title: label, message: device(d) || "–", tags: ["tada"] };
    case "pageview":
      return { title: label, message: lines(d.path, device(d)) || "–" };
    case "tolls":
      return { title: label, message: lines(Array.isArray(d.countries) ? d.countries.join(", ") : null, device(d)) || "–" };
    case "stations":
    case "nav":
    case "language":
      return { title: label, message: lines(d.country ?? d.app ?? d.to, device(d)) || "–" };
    default:
      return { title: label, message: device(d) || "–" };
  }
}

// One row of the switch list. Key "*/*" mutes everything, "<site>/*" a whole site.
export type Switch = { site: string; siteLabel: string; event: string; label: string; enabled: boolean };

export const MASTER = { site: "*", event: "*" };
export const ALL = "*";
export const switchKey = (s: { site: string; event: string }) => `${s.site}/${s.event}`;

/** What the iPhone shortcut shows in its list. */
export function switchDisplay(s: Switch): string {
  if (s.site === MASTER.site) return s.enabled ? "🔔 MINDEN ÉRTESÍTÉS BE" : "🔕 MINDEN ÉRTESÍTÉS NÉMÍTVA";
  if (s.event === ALL) return `${s.enabled ? "🔔" : "🔕"} ${s.siteLabel.toUpperCase()} – az oldal összes értesítése`;
  return `${s.enabled ? "✅" : "⬜️"} ${s.siteLabel} · ${s.label}`;
}

/** Master first; per site its own switch first, then switched-on events, then the rest. */
export function sortSwitches(list: Switch[]): Switch[] {
  return [...list].sort((a, b) => {
    if (a.site === MASTER.site) return -1;
    if (b.site === MASTER.site) return 1;
    return (
      a.siteLabel.localeCompare(b.siteLabel, "hu") ||
      Number(b.event === ALL) - Number(a.event === ALL) ||
      Number(b.enabled) - Number(a.enabled) ||
      a.label.localeCompare(b.label, "hu")
    );
  });
}

/** Whether a notification goes out: master, the site's switch and the event's switch all on. */
export function allowed(switches: Map<string, boolean>, site: string, event: string): boolean {
  return (
    switches.get(switchKey(MASTER)) !== false &&
    switches.get(switchKey({ site, event: ALL })) !== false &&
    switches.get(switchKey({ site, event })) === true
  );
}

/** The switch a shortcut picked: its shown text or its key. */
export function resolveSwitch(list: Switch[], picked: string): string | null {
  const text = picked.trim();
  const byDisplay = list.find((s) => switchDisplay(s) === text);
  if (byDisplay) return switchKey(byDisplay);
  return list.some((s) => switchKey(s) === text) ? text : null;
}

const SITE_RE = /^[a-z0-9-]{1,30}$/;
const EVENT_RE = /^[a-z0-9_.:-]{1,60}$/;

export type CatalogEntry = { event: string; label: string; on: boolean };

/** Validates a site's list of event types (POST /api/notify/register). */
export function parseCatalog(body: unknown):
  | { ok: true; value: { site: string; siteLabel: string; events: CatalogEntry[] } }
  | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "body" };
  const b = body as Record<string, unknown>;
  const site = typeof b.site === "string" ? b.site.trim() : "";
  if (!SITE_RE.test(site)) return { ok: false, error: "site" };
  if (!Array.isArray(b.events)) return { ok: false, error: "events" };
  const events: CatalogEntry[] = [];
  for (const e of b.events.slice(0, 300)) {
    if (!e || typeof e !== "object") continue;
    const r = e as Record<string, unknown>;
    const event = typeof r.event === "string" ? r.event.trim() : "";
    if (!EVENT_RE.test(event)) continue;
    const label = typeof r.label === "string" && r.label.trim() ? r.label.trim().slice(0, 80) : event;
    events.push({ event, label, on: r.default === true });
  }
  const siteLabel = typeof b.siteLabel === "string" && b.siteLabel.trim() ? b.siteLabel.trim().slice(0, 40) : site;
  return { ok: true, value: { site, siteLabel, events } };
}

/** Validates an event posted by another NorbApp site to /api/notify. */
export function parseHubEvent(body: unknown):
  | { ok: true; value: { site: string; siteLabel: string; event: string; label: string; on: boolean; notice: Notice } }
  | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "body" };
  const b = body as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() !== "" ? v.trim().slice(0, max) : null);
  const site = str(b.site, 30);
  const event = str(b.event, 60);
  if (!site || !SITE_RE.test(site) || site === MASTER.site) return { ok: false, error: "site" };
  if (!event || !EVENT_RE.test(event)) return { ok: false, error: "event" };
  const message = str(b.message, 1000);
  if (!message) return { ok: false, error: "message" };
  const label = str(b.label, 80) ?? event;
  const click = str(b.click, 300);
  const tags = Array.isArray(b.tags) ? b.tags.filter((t): t is string => typeof t === "string").slice(0, 5).map((t) => t.slice(0, 40)) : undefined;
  return {
    ok: true,
    value: {
      site,
      siteLabel: str(b.siteLabel, 40) ?? site,
      event,
      label,
      on: b.default !== false,
      notice: { title: str(b.title, 120) ?? label, message, tags, click: click && /^https:\/\//.test(click) ? click : undefined },
    },
  };
}

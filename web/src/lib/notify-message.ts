// Text of the push notification sent for a usage event (see lib/server/notify.ts).
// Returns null for event types that should not notify.

type Data = Record<string, unknown>;

export const DEFAULT_NOTIFY_EVENTS = ["plan", "plan_error", "report", "install_accepted"];

const DEVICE: Record<string, string> = { mobile: "telefon", tablet: "tablet", desktop: "számítógép" };
const STATUS: Record<string, string> = { pending: "függőben", confirmed: "megerősítve", implausible: "elutasítva" };

const device = (d: Data) => [DEVICE[String(d.device)] ?? d.device, d.os].filter(Boolean).join(", ");
const lines = (...l: unknown[]) => l.filter(Boolean).join("\n");
const km = (v: unknown) => `${Number(v ?? 0).toLocaleString("hu-HU")} km`;

export function notifyMessage(type: string, d: Data): { title: string; message: string; tags: string[] } | null {
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
      return { title: "Új kalkuláció", message: lines(route, extra.join(" · "), device(d)), tags: ["fuelpump"] };
    }
    case "plan_error":
      return { title: "Hibás kalkuláció", message: lines(`Hibakód: ${d.code ?? "ismeretlen"}`, device(d)), tags: ["warning"] };
    case "report":
      return {
        title: "Ár-jelzés",
        message: lines(`${d.country ?? "?"} · ${d.fuel ?? "?"} · ${STATUS[String(d.status)] ?? d.status}`, device(d)),
        tags: ["moneybag"],
      };
    case "install_accepted":
      return { title: "Telepítették az appot", message: device(d) || "–", tags: ["tada"] };
    default:
      return null;
  }
}

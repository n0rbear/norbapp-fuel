import { describe, expect, it } from "vitest";
import { allowed, fuelNotice, parseHubEvent, sortSwitches, switchDisplay, type Switch } from "@/lib/notify-message";

describe("fuelNotice", () => {
  it("describes a calculation", () => {
    const m = fuelNotice("plan", { countries: ["HU", "AT", "DE"], km: 1234, stops: 2, fuel: "diesel", roundTrip: true, waypoints: 0, device: "mobile", os: "iOS" });
    expect(m.title).toBe("Új kalkuláció");
    expect(m.message).toContain("HU → AT → DE");
    expect(m.message).toContain("2 tankolás · diesel · oda-vissza");
    expect(m.message).toContain("telefon, iOS");
  });

  it("covers errors, reports, installs and unknown events", () => {
    expect(fuelNotice("plan_error", { code: "NO_ROUTE" }).message).toBe("Hibakód: NO_ROUTE");
    expect(fuelNotice("report", { country: "DE", fuel: "e5", status: "confirmed" }).message).toBe("DE · e5 · megerősítve");
    expect(fuelNotice("install_accepted", { device: "mobile", os: "Android" }).message).toBe("telefon, Android");
    expect(fuelNotice("something_new", {}).title).toBe("something_new");
  });
});

describe("switches", () => {
  const sw = (site: string, event: string, enabled: boolean, siteLabel = site, label = event): Switch => ({ site, event, enabled, siteLabel, label });

  it("needs the master and the event switch on", () => {
    const map = new Map([["*/*", true], ["fuel/plan", true], ["fuel/pageview", false]]);
    expect(allowed(map, "fuel", "plan")).toBe(true);
    expect(allowed(map, "fuel", "pageview")).toBe(false);
    expect(allowed(map, "fuel", "unknown")).toBe(false);
    map.set("*/*", false);
    expect(allowed(map, "fuel", "plan")).toBe(false);
  });

  it("lists the master first, then by site with switched-on events first", () => {
    const list = sortSwitches([sw("spiribook", "b", false, "Spiribook", "B"), sw("fuel", "a", false, "Fuel", "A"), sw("*", "*", true), sw("fuel", "z", true, "Fuel", "Z")]);
    expect(list.map((s) => `${s.site}/${s.event}`)).toEqual(["*/*", "fuel/z", "fuel/a", "spiribook/b"]);
    expect(switchDisplay(list[0])).toContain("BE");
    expect(switchDisplay(list[1])).toBe("✅ Fuel · Z");
    expect(switchDisplay(list[2])).toBe("⬜️ Fuel · A");
  });
});

describe("parseHubEvent", () => {
  it("accepts an event from another site", () => {
    const r = parseHubEvent({ site: "keto", siteLabel: "Keto Mentor", event: "signup", label: "Új regisztráció", message: "hu", click: "https://keto.norbapp.com" });
    expect(r).toEqual({
      ok: true,
      value: { site: "keto", siteLabel: "Keto Mentor", event: "signup", label: "Új regisztráció", on: true, notice: { title: "Új regisztráció", message: "hu", tags: undefined, click: "https://keto.norbapp.com" } },
    });
    const off = parseHubEvent({ site: "keto", event: "login", message: "x", default: false });
    expect(off.ok && off.value.on).toBe(false);
  });

  it("rejects bad sites, events and empty messages", () => {
    expect(parseHubEvent({ site: "*", event: "x", message: "m" }).ok).toBe(false);
    expect(parseHubEvent({ site: "Keto Mentor", event: "x", message: "m" }).ok).toBe(false);
    expect(parseHubEvent({ site: "keto", event: "a b", message: "m" }).ok).toBe(false);
    expect(parseHubEvent({ site: "keto", event: "x", message: " " }).ok).toBe(false);
    expect(parseHubEvent(null).ok).toBe(false);
  });
});

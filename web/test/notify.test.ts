import { describe, expect, it } from "vitest";
import { allowed, comparable, formatCity, fuelNotice, parseCatalog, parseHubEvent, resolveSwitch, sortSwitches, switchDisplay, withPlace, type Switch } from "@/lib/notify-message";

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

  it("a site's own switch mutes all its events", () => {
    const map = new Map([["*/*", true], ["keto/*", false], ["keto/signup", true], ["fuel/plan", true]]);
    expect(allowed(map, "keto", "signup")).toBe(false);
    expect(allowed(map, "fuel", "plan")).toBe(true);
  });

  it("lists the master first, then per site its own switch, switched-on events, the rest", () => {
    const list = sortSwitches([
      sw("spiribook", "b", false, "Spiribook", "B"),
      sw("fuel", "a", false, "Fuel", "A"),
      sw("*", "*", true),
      sw("fuel", "z", true, "Fuel", "Z"),
      sw("fuel", "*", true, "Fuel", "Az oldal összes értesítése"),
    ]);
    expect(list.map((s) => `${s.site}/${s.event}`)).toEqual(["*/*", "fuel/*", "fuel/z", "fuel/a", "spiribook/b"]);
    expect(switchDisplay(list[0])).toBe("🔔 MINDEN ÉRTESÍTÉS BE");
    expect(switchDisplay(list[1])).toBe("🔔 FUEL – az oldal összes értesítése");
    expect(switchDisplay(list[2])).toBe("✅ Fuel · Z");
    expect(switchDisplay(list[3])).toBe("⬜️ Fuel · A");
  });

  it("finds a switch by its shown line or its key", () => {
    const list = [sw("fuel", "plan", true, "Fuel", "Új kalkuláció"), sw("*", "*", false)];
    expect(resolveSwitch(list, "✅ Fuel · Új kalkuláció")).toBe("fuel/plan");
    expect(resolveSwitch(list, "fuel/plan")).toBe("fuel/plan");
    expect(resolveSwitch(list, "🔕 MINDEN ÉRTESÍTÉS NÉMÍTVA")).toBe("*/*");
    expect(resolveSwitch(list, "valami")).toBeNull();
    // other emoji variant, decomposed accents, extra spaces
    expect(resolveSwitch(list, "☑️  Fuel · U\u0301j kalkuláció ")).toBe("fuel/plan");
    expect(resolveSwitch(list, "🔔 Minden értesítés be")).toBe("*/*");
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

describe("parseCatalog", () => {
  it("keeps valid event types with their labels and defaults", () => {
    const r = parseCatalog({ site: "keto", siteLabel: "Keto Mentor", events: [{ event: "signup", label: "Új regisztráció", default: true }, { event: "login", label: "Bejelentkezés" }, { event: "bad event" }, null] });
    expect(r).toEqual({ ok: true, value: { site: "keto", siteLabel: "Keto Mentor", events: [{ event: "signup", label: "Új regisztráció", on: true }, { event: "login", label: "Bejelentkezés", on: false }] } });
    expect(parseCatalog({ site: "*", events: [] }).ok).toBe(false);
    expect(parseCatalog({ site: "keto" }).ok).toBe(false);
  });
});

describe("comparable", () => {
  it("keeps only the words", () => {
    expect(comparable("⬜️ Keto Mentor · Visszajelzés (hiba vagy ötlet)")).toBe("keto mentor · visszajelzés (hiba vagy ötlet)");
  });
});

describe("withPlace", () => {
  it("adds the country as the last line", () => {
    expect(withPlace("week · telefon", "Magyarország")).toBe("week · telefon\n📍 Magyarország");
    expect(withPlace("week · telefon", null)).toBe("week · telefon");
  });

  it("keeps the visitor IP out of the notice", () => {
    const r = parseHubEvent({ site: "keto", event: "pageview", message: "m", ip: "84.2.44.1" });
    expect(r.ok && r.value.ip).toBe("84.2.44.1");
    expect(r.ok && JSON.stringify(r.value.notice)).not.toContain("84.2.44.1");
    const bad = parseHubEvent({ site: "keto", event: "pageview", message: "m", ip: "<script>" });
    expect(bad.ok && bad.value.ip).toBeUndefined();
  });
});

describe("formatCity", () => {
  it("city in English, country in Hungarian, region or country when there is no city", () => {
    expect(formatCity({ city: { names: { en: "Budapest" } }, country: { iso_code: "HU" } })).toBe("Budapest, Magyarország");
    expect(formatCity({ subdivisions: [{ names: { en: "Bavaria" } }], country: { iso_code: "DE" } })).toBe("Bavaria, Németország");
    expect(formatCity({ country: { iso_code: "AT" } })).toBe("Ausztria");
    expect(formatCity({})).toBeNull();
  });
});


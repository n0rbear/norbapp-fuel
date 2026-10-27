import { describe, expect, it } from "vitest";
import { notifyMessage } from "@/lib/notify-message";

describe("notifyMessage", () => {
  it("describes a calculation", () => {
    const m = notifyMessage("plan", { countries: ["HU", "AT", "DE"], km: 1234, stops: 2, fuel: "diesel", roundTrip: true, waypoints: 0, device: "mobile", os: "iOS" });
    expect(m?.title).toBe("Új kalkuláció");
    expect(m?.message).toContain("HU → AT → DE");
    expect(m?.message).toContain("2 tankolás · diesel · oda-vissza");
    expect(m?.message).toContain("telefon, iOS");
  });

  it("covers errors, reports and installs, skips everything else", () => {
    expect(notifyMessage("plan_error", { code: "NO_ROUTE" })?.message).toBe("Hibakód: NO_ROUTE");
    expect(notifyMessage("report", { country: "DE", fuel: "e5", status: "confirmed" })?.message).toContain("DE · e5 · megerősítve");
    expect(notifyMessage("install_accepted", { device: "mobile", os: "Android" })?.message).toBe("telefon, Android");
    expect(notifyMessage("pageview", {})).toBeNull();
  });
});

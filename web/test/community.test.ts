import { describe, expect, it } from "vitest";
import { consensus, neighbourOffset, pendingReport, plausible, stationPrice } from "@/lib/community";

const H = 3600_000;
const now = 1_800_000_000_000;
const r = (price: number, deviceId: string, ipHash: string, hoursAgo = 0) => ({ price, deviceId, ipHash, at: now - hoursAgo * H });

describe("consensus", () => {
  it("needs two devices on two connections with nearly the same price", () => {
    expect(consensus([r(1.659, "a", "x")], now)).toBeNull();
    expect(consensus([r(1.659, "a", "x"), r(1.669, "b", "x")], now)).toBeNull(); // same connection
    expect(consensus([r(1.659, "a", "x"), r(1.669, "b", "y")], now)).toEqual({ price: 1.664, count: 2 });
  });

  it("ignores prices that disagree, repeated devices and old reports", () => {
    expect(consensus([r(1.659, "a", "x"), r(1.759, "b", "y")], now)).toBeNull();
    expect(consensus([r(1.659, "a", "x"), r(1.659, "a", "y")], now)).toBeNull();
    expect(consensus([r(1.659, "a", "x", 13), r(1.659, "b", "y")], now)).toBeNull();
  });

  it("uses each device's latest report and the largest agreeing group", () => {
    const reports = [r(1.9, "a", "x", 2), r(1.659, "a", "x"), r(1.66, "b", "y"), r(1.661, "c", "z"), r(1.8, "d", "w")];
    expect(consensus(reports, now)).toEqual({ price: 1.66, count: 3 });
  });
});

describe("pendingReport", () => {
  it("shows the latest unconfirmed report", () => {
    expect(pendingReport([r(1.7, "a", "x", 1), r(1.65, "b", "y")], now, null)).toEqual({ price: 1.65, count: 1 });
    expect(pendingReport([r(1.65, "a", "x", 3)], now, now - 2 * H)).toBeNull();
  });
});

describe("plausible", () => {
  it("rejects prices far from the average or from nearby stations", () => {
    expect(plausible(1.7, 1.65, null)).toBe(true);
    expect(plausible(2.2, 1.65, null)).toBe(false);
    expect(plausible(1.9, 1.65, 1.62)).toBe(false);
    expect(plausible(0.1, 0.12, null)).toBe(false);
  });
});

describe("stationPrice", () => {
  const own = { price: 1.6, baseline: 1.7, confirmedAt: now - 10 * H, reporters: 3 };

  it("shows a fresh confirmed price as is", () => {
    expect(stationPrice(1.75, own, [], now)).toEqual({ kind: "confirmed", price: 1.6, confirmedAt: own.confirmedAt, reporters: 3 });
  });

  it("applies the station's learned offset to today's average later on", () => {
    const old = { ...own, confirmedAt: now - 5 * 24 * H };
    expect(stationPrice(1.75, old, [], now)).toMatchObject({ kind: "learned", price: 1.65 });
  });

  it("nudges unknown stations by their confirmed neighbours", () => {
    const neighbours = [
      { offset: -0.1, distanceKm: 1, confirmedAt: now - H },
      { offset: -0.1, distanceKm: 2, confirmedAt: now - H },
    ];
    expect(neighbourOffset(neighbours, now)).toBeCloseTo(-0.05, 5);
    expect(stationPrice(1.7, null, neighbours, now)).toEqual({ kind: "estimate", price: 1.65 });
    expect(stationPrice(1.7, null, [{ offset: -0.1, distanceKm: 50, confirmedAt: now }], now)).toEqual({ kind: "estimate", price: 1.7 });
  });
});

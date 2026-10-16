import { describe, expect, it } from "vitest";
import { computeFuelCost, planRefuels, type Vehicle } from "@/lib/trip";

const car: Vehicle = { consumption: 10, tankSize: 50, startLevelPct: 100, reservePct: 20 };
// 10 l/100 km, 50 l tank, 10 l reserve => 400 km from full to reserve.

describe("planRefuels", () => {
  it("needs no stop when the trip fits above the reserve", () => {
    const plan = planRefuels(400, car);
    expect(plan.stops).toEqual([]);
    expect(plan.totalLitres).toBeCloseTo(40);
  });

  it("stops exactly where the reserve is reached and fills up", () => {
    const plan = planRefuels(500, car);
    expect(plan.stops).toHaveLength(1);
    expect(plan.stops[0].km).toBeCloseTo(400);
    expect(plan.stops[0].litres).toBeCloseTo(40);
  });

  it("plans multiple stops on long trips", () => {
    const plan = planRefuels(1300, car);
    expect(plan.stops.map((s) => Math.round(s.km))).toEqual([400, 800, 1200]);
  });

  it("respects a partial start level", () => {
    const plan = planRefuels(300, { ...car, startLevelPct: 50 });
    // 25 l at start, 15 l usable above reserve => stop at 150 km.
    expect(plan.stops[0].km).toBeCloseTo(150);
    expect(plan.stops[0].litres).toBeCloseTo(40);
  });

  it("refuels at the start when already below the reserve", () => {
    const plan = planRefuels(100, { ...car, startLevelPct: 10 });
    expect(plan.stops[0].km).toBe(0);
    expect(plan.stops[0].litres).toBeCloseTo(45);
  });

  it("never plans a stop at the start with a full tank", () => {
    expect(planRefuels(1300, car, true).stops[0].km).toBeCloseTo(400);
  });

  it("fills up before departure when asked", () => {
    const plan = planRefuels(500, { ...car, startLevelPct: 50 }, true);
    expect(plan.stops[0]).toEqual({ km: 0, litres: 25 });
    // Full tank at km 0 => next stop where the reserve is reached.
    expect(plan.stops[1].km).toBeCloseTo(400);
  });

  it("rejects invalid vehicles", () => {
    expect(() => planRefuels(100, { ...car, consumption: 0 })).toThrow();
    expect(() => planRefuels(100, { ...car, reservePct: 95 })).toThrow();
  });
});

describe("computeFuelCost", () => {
  it("prices the burned fuel per segment", () => {
    const plan = planRefuels(500, car);
    const cost = computeFuelCost(plan, car.consumption, [
      { price: 2, source: "station" },
      { price: 1, source: "station" },
    ]);
    // 40 l at 2 €/l, then 10 l at 1 €/l.
    expect(cost.fuelCost).toBeCloseTo(90);
    expect(cost.paidAtStops).toBeCloseTo(40);
    expect(cost.stops[0].cost).toBeCloseTo(40);
  });

  it("is monotonic in distance (regression: longer trips must not get cheaper)", () => {
    const price = [{ price: 1.7, source: "default" as const }];
    const short = computeFuelCost(planRefuels(399, car), car.consumption, price).fuelCost;
    const plan = planRefuels(401, car);
    const long = computeFuelCost(
      plan,
      car.consumption,
      plan.stops.map(() => price[0]).concat(price),
    ).fuelCost;
    expect(long).toBeGreaterThan(short);
  });

  it("requires one price per fuel point", () => {
    expect(() => computeFuelCost(planRefuels(500, car), 10, [{ price: 1, source: "manual" }])).toThrow();
  });
});

import { describe, expect, it } from "vitest";
import { RateLimiter } from "@/lib/server/rate-limit";

describe("RateLimiter", () => {
  it("allows a burst up to capacity, then refills over time", () => {
    const limiter = new RateLimiter(2, 60);
    const t = 1_000_000;
    expect(limiter.take("ip", t)).toBe(true);
    expect(limiter.take("ip", t)).toBe(true);
    expect(limiter.take("ip", t)).toBe(false);
    expect(limiter.take("other", t)).toBe(true);
    expect(limiter.take("ip", t + 1_000)).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "../map-with-concurrency.js";

describe("mapWithConcurrency", () => {
  it("keeps result order while running a limited number of workers", async () => {
    let active = 0;
    let peak = 0;
    const results = await mapWithConcurrency([1, 2, 3, 4], 2, async (value) => {
      active += 1;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active -= 1;
      return value * 10;
    });
    expect(results).toEqual([10, 20, 30, 40]);
    expect(peak).toBeLessThanOrEqual(2);
  });
});

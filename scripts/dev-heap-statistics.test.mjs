import { describe, expect, test } from "bun:test";
import { createHeapStatisticsCache, isDevNextBunProcess } from "./dev-heap-statistics.mjs";

describe("dev heap statistics cache", () => {
  test("preserves fields, isolates mutations, and refreshes after the TTL", () => {
    let time = 100;
    let calls = 0;
    const cache = createHeapStatisticsCache(
      () => ({ used_heap_size: ++calls, heap_size_limit: 10, extra_field: "kept" }),
      () => time,
    );

    const first = cache();
    first.used_heap_size = 999;
    expect(cache()).toEqual({ used_heap_size: 1, heap_size_limit: 10, extra_field: "kept" });

    time = 5_099;
    expect(cache().used_heap_size).toBe(1);
    time = 5_100;
    expect(cache().used_heap_size).toBe(2);
    expect(calls).toBe(2);
  });

  test("starts the TTL after the expensive call", () => {
    let time = 0;
    let calls = 0;
    const cache = createHeapStatisticsCache(
      () => {
        calls += 1;
        time += 4_000;
        return { used_heap_size: calls };
      },
      () => time,
    );

    expect(cache().used_heap_size).toBe(1);
    time = 8_999;
    expect(cache().used_heap_size).toBe(1);
    time = 9_000;
    expect(cache().used_heap_size).toBe(2);
  });

  test("does not cache failures", () => {
    let calls = 0;
    const cache = createHeapStatisticsCache(() => {
      calls += 1;
      throw new Error("heap stats failed");
    });

    expect(() => cache()).toThrow("heap stats failed");
    expect(() => cache()).toThrow("heap stats failed");
    expect(calls).toBe(2);
  });

  test("does not enable itself outside a Bun Next dev process", () => {
    expect(isDevNextBunProcess({ bunVersion: null, env: { OMP_REEVE_DEV_HEAP_STATISTICS: "1" }, argv: ["dev"] })).toBe(false);
    expect(isDevNextBunProcess({ bunVersion: "1.4.0", env: {}, argv: ["start"] })).toBe(false);
    expect(isDevNextBunProcess({ bunVersion: "1.4.0", env: { OMP_REEVE_DEV_HEAP_STATISTICS: "1" }, argv: ["start"] })).toBe(false);
  });
});

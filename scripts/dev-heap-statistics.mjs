const CACHE_TTL_MS = 5_000;

export function createHeapStatisticsCache(getHeapStatistics, now = () => performance.now()) {
  let cached;
  let refreshedAt = -Infinity;

  return function getCachedHeapStatistics() {
    const currentTime = now();
    if (cached !== undefined && currentTime - refreshedAt < CACHE_TTL_MS) {
      return { ...cached };
    }

    const statistics = getHeapStatistics();
    cached = { ...statistics };
    refreshedAt = now();
    return { ...cached };
  };
}

export function isDevNextBunProcess({
  bunVersion = process.versions.bun,
  env = process.env,
  argv = process.argv,
} = {}) {
  return bunVersion !== undefined && bunVersion !== null &&
    env.OMP_REEVE_DEV_HEAP_STATISTICS === "1" &&
    (env.__NEXT_DEV_SERVER === "1" || argv.includes("dev"));
}

// Next checks this on every dev request; Bun's V8 shim walks JSC's heap each time.
if (isDevNextBunProcess()) {
  const v8Module = await import("node:v8");
  const v8 = v8Module.default ?? v8Module;
  v8.getHeapStatistics = createHeapStatisticsCache(v8.getHeapStatistics.bind(v8));
}

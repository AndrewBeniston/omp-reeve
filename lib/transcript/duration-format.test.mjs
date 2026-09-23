import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const { formatDuration } = await createJiti(import.meta.url).import("./duration-format.ts");

test("formats elapsed milliseconds as trimmed narrow units", () => {
  for (const [milliseconds, expected] of [
    [999, "0s"],
    [45_000, "45s"],
    [65_000, "1m 5s"],
    [120_000, "2m"],
    [3_903_000, "1h 5m 3s"],
    [93_600_000, "1d 2h"],
  ]) {
    assert.equal(formatDuration(milliseconds, "en"), expected);
  }
});

test("removes Hungarian separator parts from each unit", () => {
  assert.equal(formatDuration(93_600_000, "hu-HU"), "1nap 2ó");
});

test("uses 0s when the platform formatter returns no parts", () => {
  const nativeNumberFormat = Intl.NumberFormat;
  Intl.NumberFormat = class {
    resolvedOptions() {
      return { locale: "en" };
    }

    formatToParts() {
      return [];
    }
  };

  try {
    assert.equal(formatDuration(1_000, "en"), "0s");
  } finally {
    Intl.NumberFormat = nativeNumberFormat;
  }
});

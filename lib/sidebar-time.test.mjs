import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { interopDefault: true, moduleCache: false });
const { formatCompactSidebarTime } = await jiti.import("./sidebar-time.ts");

const now = new Date("2026-09-04T12:00:00.000Z");

test("formats the compact Codex chat activity time", () => {
  assert.equal(formatCompactSidebarTime("2026-09-04T11:59:40.000Z", "en", now), "now");
  assert.equal(formatCompactSidebarTime("2026-09-04T11:54:00.000Z", "en", now), "6m");
  assert.equal(formatCompactSidebarTime("2026-09-04T06:00:00.000Z", "en", now), "6h");
  assert.equal(formatCompactSidebarTime("2026-09-02T12:00:00.000Z", "en", now), "2d");
});

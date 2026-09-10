import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
const { getRecentProjects } = await createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true }).import("./SessionSidebar.tsx");
test("projectless sessions from different dates share one sidebar group", () => {
  const sessions = [
    { id: "a", cwd: "/Users/test/omp-cwd-20260905", modified: "2026-09-05" },
    { id: "b", cwd: "/Users/test/omp-cwd-20260908", modified: "2026-09-08" },
    { id: "c", cwd: "/projects/app", modified: "2026-09-07" },
  ];
  assert.equal(getRecentProjects(sessions).length, 2);
  assert.equal(sessions[0].cwd, "/Users/test/omp-cwd-20260905");
});

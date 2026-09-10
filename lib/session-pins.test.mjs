import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

test("session pins persist and can be removed", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "omp-session-pins-"));
  t.after(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  const { loadPinnedSessionIds, setSessionPinned } = await createJiti(import.meta.url, {
    moduleCache: false,
    tryNative: false,
    tsconfigPaths: true,
  }).import("./session-pins.ts");

  assert.deepEqual([...await loadPinnedSessionIds(directory)], []);
  await setSessionPinned("session-b", true, directory);
  await setSessionPinned("session-a", true, directory);
  assert.deepEqual([...await loadPinnedSessionIds(directory)].sort(), ["session-a", "session-b"]);
  await setSessionPinned("session-b", false, directory);
  assert.deepEqual([...await loadPinnedSessionIds(directory)], ["session-a"]);
});

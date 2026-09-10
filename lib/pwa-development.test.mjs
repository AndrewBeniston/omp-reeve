import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { interopDefault: true, moduleCache: false });
const { clearDevelopmentPwaState } = await jiti.import("./pwa-development.ts");

test("development removes service workers and Reeve PWA caches", async () => {
  const calls = [];
  const registrations = ["first", "second"].map((name) => ({
    unregister: async () => { calls.push(`unregister:${name}`); return true; },
  }));
  const cacheStorage = {
    keys: async () => ["pi-web-static-0.3.0", "pi-web-static-0.4.2", "unrelated-cache"],
    delete: async (name) => { calls.push(`delete:${name}`); return true; },
  };

  await clearDevelopmentPwaState({
    getRegistrations: async () => registrations,
    cacheStorage,
  });

  assert.deepEqual(calls, [
    "unregister:first",
    "unregister:second",
    "delete:pi-web-static-0.3.0",
    "delete:pi-web-static-0.4.2",
  ]);
});

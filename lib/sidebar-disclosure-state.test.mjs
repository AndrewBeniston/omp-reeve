import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { interopDefault: true, moduleCache: false });
const {
  loadCollapsedProjectIds,
  saveCollapsedProjectIds,
} = await jiti.import("./sidebar-disclosure-state.ts");

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

test("project disclosure state survives a fresh application read", () => {
  const storage = createStorage();
  saveCollapsedProjectIds(new Set(["/Users/andrew/OMP Web"]), storage);

  assert.deepEqual(
    [...loadCollapsedProjectIds(storage)],
    ["/Users/andrew/OMP Web"],
  );
});

test("project disclosure state ignores invalid stored values", () => {
  const storage = createStorage({ "omp-web:collapsed-projects": "{}" });
  assert.deepEqual([...loadCollapsedProjectIds(storage)], []);
});

test("project disclosure state tolerates unavailable application storage", () => {
  const unavailable = {
    getItem() { throw new Error("unavailable"); },
    removeItem() { throw new Error("unavailable"); },
    setItem() { throw new Error("unavailable"); },
  };

  assert.deepEqual([...loadCollapsedProjectIds(unavailable)], []);
  assert.doesNotThrow(() => saveCollapsedProjectIds(new Set(["/tmp/project"]), unavailable));
});

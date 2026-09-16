import assert from "node:assert/strict";
import test from "node:test";

/** A local storage that behaves like the browser's, including its failure. */
function fakeStorage({ denied = false } = {}) {
  const entries = new Map();
  return {
    entries,
    localStorage: {
      getItem: (key) => (entries.has(key) ? entries.get(key) : null),
      setItem: (key, value) => { if (denied) throw new Error("denied"); entries.set(key, value); },
      removeItem: (key) => { entries.delete(key); },
    },
  };
}

const { readReviewComments, writeReviewComments } = await import("./review-comment-store.ts");

const comment = {
  id: "c1", path: "notes.txt", side: "additions", startLine: 2, endLine: 2,
  revision: "rev", body: "note", createdAt: "now", updatedAt: "now",
};

test("each owner reads only its own comments", (t) => {
  const storage = fakeStorage();
  globalThis.window = storage;
  t.after(() => { delete globalThis.window; });

  writeReviewComments("session:one", [comment]);
  assert.deepEqual(readReviewComments("session:one"), [comment]);
  assert.deepEqual(readReviewComments("session:two"), []);
  assert.deepEqual(readReviewComments("project:/repo"), []);

  // Emptying an owner clears its entry rather than leaving an empty list behind.
  writeReviewComments("session:one", []);
  assert.deepEqual(readReviewComments("session:one"), []);
  assert.equal(storage.entries.size, 0);
});

test("stored rubbish is ignored rather than shown as a comment", (t) => {
  const storage = fakeStorage();
  globalThis.window = storage;
  t.after(() => { delete globalThis.window; });

  storage.entries.set("omp-review-comments:session:one", "not json");
  assert.deepEqual(readReviewComments("session:one"), []);
  storage.entries.set("omp-review-comments:session:one", JSON.stringify([comment, { id: "bad" }, null]));
  assert.deepEqual(readReviewComments("session:one"), [comment]);
});

test("storage that refuses a write does not lose the panel's comments", (t) => {
  globalThis.window = fakeStorage({ denied: true });
  t.after(() => { delete globalThis.window; });
  assert.doesNotThrow(() => writeReviewComments("session:one", [comment]));
});

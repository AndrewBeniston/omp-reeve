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

const {
  dismissReviewFinding,
  isReviewFindingDismissed,
  mutateReviewFindingViews,
  readReviewFindingViews,
  restoreReviewFinding,
  writeReviewFindingViews,
} = await import("./review-finding-store.ts");

test("a dismissed finding is still dismissed on the next visit", (t) => {
  const storage = fakeStorage();
  globalThis.window = storage;
  t.after(() => { delete globalThis.window; });

  writeReviewFindingViews("session:one", dismissReviewFinding([], "e1#0", "2026-09-15T10:00:00.000Z"));
  const reloaded = readReviewFindingViews("session:one");
  assert.equal(reloaded.length, 1);
  assert.ok(isReviewFindingDismissed(reloaded, "e1#0"));
  assert.ok(!isReviewFindingDismissed(reloaded, "e1#1"));

  // Reversible: the record is the only dismissal, so removing it restores it.
  writeReviewFindingViews("session:one", restoreReviewFinding(reloaded, "e1#0"));
  assert.deepEqual(readReviewFindingViews("session:one"), []);
  assert.equal(storage.entries.size, 0);
});

test("one Session never reads what another put away", (t) => {
  globalThis.window = fakeStorage();
  t.after(() => { delete globalThis.window; });

  writeReviewFindingViews("session:one@/repo", dismissReviewFinding([], "e1#0", "now"));
  assert.deepEqual(readReviewFindingViews("session:two@/repo"), []);
  assert.deepEqual(readReviewFindingViews("project:/repo"), []);
});

test("a change started for another owner writes nothing", (t) => {
  globalThis.window = fakeStorage();
  t.after(() => { delete globalThis.window; });

  assert.equal(mutateReviewFindingViews("session:one", "session:two", () => [{ id: "e1#0", dismissedAt: "now" }]), null);
  assert.deepEqual(readReviewFindingViews("session:one"), []);
  const written = mutateReviewFindingViews("session:one", "session:one", (current) => dismissReviewFinding(current, "e1#0", "now"));
  assert.equal(written.length, 1);
});

test("stored rubbish is ignored rather than read as a dismissal", (t) => {
  const storage = fakeStorage();
  globalThis.window = storage;
  t.after(() => { delete globalThis.window; });

  storage.entries.set("omp-review-findings:session:one", "{not json");
  assert.deepEqual(readReviewFindingViews("session:one"), []);
  storage.entries.set("omp-review-findings:session:one", JSON.stringify([{ id: 1 }, { dismissedAt: "now" }, { id: "e1#0", dismissedAt: "now" }]));
  assert.deepEqual(readReviewFindingViews("session:one"), [{ id: "e1#0", dismissedAt: "now" }]);
});

test("dismissing twice records one dismissal", () => {
  const once = dismissReviewFinding([], "e1#0", "first");
  assert.deepEqual(dismissReviewFinding(once, "e1#0", "second"), once);
});

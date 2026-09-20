import assert from "node:assert/strict";
import test from "node:test";
import { acknowledgePrDraft, migratePrDrafts, mutatePrDrafts, readPrDrafts, reviewPrDraftOwner, reviewPrDraftPin } from "./review-pr-drafts.ts";

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    key: (index) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
}

const LEGACY = "omp-review-pr-drafts:v1:";
function legacyKey(cwd, sessionId, subject) {
  return LEGACY + JSON.stringify([cwd, sessionId, subject.remoteId, subject.hostname.toLowerCase(),
    subject.owner.toLowerCase(), subject.repository.toLowerCase(), subject.account, subject.number, subject.headSha]);
}
const identity = { remoteId: "origin-slot", hostname: "github.com", owner: "example", repository: "project", account: "reviewer", number: 7, headSha: "head-a" };
const draft = { id: "one", publication: { action: "reply", threadId: "thread-1", body: "Please explain this" }, updatedAt: "2026-09-15T00:00:00Z", saved: true };

test("edits and late publication acknowledgements remain in the original Session, cwd, remote and pull request", () => {
  const store = storage();
  const original = reviewPrDraftOwner("/fixture", "session-a", identity);
  mutatePrDrafts(store, original, () => [draft]);
  for (const owner of [reviewPrDraftOwner("/fixture", "session-b", identity), reviewPrDraftOwner("/other-worktree", "session-a", identity),
    reviewPrDraftOwner("/fixture", "session-a", { ...identity, number: 8 }),
    reviewPrDraftOwner("/fixture", "session-a", { ...identity, account: "someone-else" }),
    reviewPrDraftOwner("/fixture", "session-a", { ...identity, remoteId: "upstream-slot" })]) {
    mutatePrDrafts(store, owner, () => [{ ...draft, publication: { ...draft.publication, body: "Other editor" } }]);
    mutatePrDrafts(store, original, (current) => acknowledgePrDraft(current, draft));
    assert.equal(readPrDrafts(store, owner)[0].publication.body, "Other editor");
  }
});

test("a moved head keeps the drafts, and the pin says what they were written against", () => {
  const store = storage();
  const before = reviewPrDraftOwner("/fixture", "session-a", identity);
  const after = reviewPrDraftOwner("/fixture", "session-a", { ...identity, headSha: "head-b", baseSha: "base-b" });
  assert.equal(after, before);
  mutatePrDrafts(store, before, () => [{ ...draft, pinned: reviewPrDraftPin({ ...identity, baseSha: "base-a" }) }]);
  const kept = readPrDrafts(store, after);
  assert.equal(kept.length, 1);
  assert.deepEqual(kept[0].pinned, { headSha: "head-a", baseSha: "base-a" });
});

test("drafts stranded under the revision-keyed store are recovered once, with their revision", () => {
  const store = storage();
  const owner = reviewPrDraftOwner("/fixture", "session-a", identity);
  store.setItem(legacyKey("/fixture", "session-a", identity), JSON.stringify([draft]));
  store.setItem(legacyKey("/fixture", "session-a", { ...identity, headSha: "head-b" }),
    JSON.stringify([{ ...draft, id: "two" }]));
  // Another Session's pile is not this owner's to move.
  store.setItem(legacyKey("/fixture", "session-b", identity), JSON.stringify([{ ...draft, id: "elsewhere" }]));

  const migrated = migratePrDrafts(store, owner);
  assert.deepEqual(migrated.map((item) => [item.id, item.pinned.headSha, item.pinned.baseSha]),
    [["one", "head-a", ""], ["two", "head-b", ""]]);
  assert.equal(store.getItem(legacyKey("/fixture", "session-a", identity)), null);
  assert.notEqual(store.getItem(legacyKey("/fixture", "session-b", identity)), null);
  assert.deepEqual(migratePrDrafts(store, owner).map((item) => item.id), ["one", "two"]);
});

test("migration never overwrites a later edit, and keeps the old pile when the write fails", () => {
  const store = storage();
  const owner = reviewPrDraftOwner("/fixture", "session-a", identity);
  mutatePrDrafts(store, owner, () => [{ ...draft, publication: { ...draft.publication, body: "Edited since" } }]);
  const key = legacyKey("/fixture", "session-a", identity);
  store.setItem(key, JSON.stringify([draft]));
  assert.equal(migratePrDrafts(store, owner)[0].publication.body, "Edited since");

  store.setItem(key, JSON.stringify([{ ...draft, id: "three" }]));
  const failing = { ...store, length: store.length, setItem: () => { throw new Error("quota"); } };
  assert.throws(() => migratePrDrafts(failing, owner));
  assert.notEqual(store.getItem(key), null);
});

test("a stale editor mutation reads current drafts and a late acknowledgement preserves newer body", () => {
  const store = storage();
  const owner = reviewPrDraftOwner("/fixture", "session-a", identity);
  mutatePrDrafts(store, owner, () => [draft]);
  mutatePrDrafts(store, owner, (current) => [...current, { ...draft, id: "two" }]);
  mutatePrDrafts(store, owner, (current) => current.map((item) => item.id === "one" ? { ...item, publication: { ...item.publication, body: "Newer body" } } : item));
  mutatePrDrafts(store, owner, (current) => acknowledgePrDraft(current, draft));
  assert.equal(readPrDrafts(store, owner).length, 2);
  assert.equal(readPrDrafts(store, owner)[0].publication.body, "Newer body");
});

test("uncertain publication survives reload for comments and thread mutations", () => {
  const store = storage();
  mutatePrDrafts(store, "owner", () => [{ ...draft, uncertain: true },
    { ...draft, id: "resolve", uncertain: true, publication: { action: "resolve", threadId: "thread-1" } }]);
  assert.equal(readPrDrafts(store, "owner").length, 2);
  assert.ok(readPrDrafts(store, "owner").every((item) => item.uncertain));
});

test("unreadable drafts are not overwritten", () => {
  const store = storage();
  store.setItem("omp-review-pr-drafts:v2:owner", "broken");
  assert.throws(() => mutatePrDrafts(store, "owner", () => [draft]));
  assert.equal(store.getItem("omp-review-pr-drafts:v2:owner"), "broken");
  assert.throws(() => migratePrDrafts(store, "owner"));
});

test("an unreadable old pile is left where it is rather than deleted", () => {
  const store = storage();
  const owner = reviewPrDraftOwner("/fixture", "session-a", identity);
  const broken = legacyKey("/fixture", "session-a", identity);
  store.setItem(broken, "broken");
  store.setItem(legacyKey("/fixture", "session-a", { ...identity, headSha: "head-b" }), JSON.stringify([draft]));
  assert.deepEqual(migratePrDrafts(store, owner).map((item) => item.id), ["one"]);
  assert.equal(store.getItem(broken), "broken");
});

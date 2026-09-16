import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalReviewCwd,
  removeReviewComment,
  reviewCommentOwnerKey,
  upsertReviewComment,
} from "./review-comments.ts";
import { mutateReviewComments, readReviewComments, writeReviewComments } from "./review-comment-store.ts";

function useStorage(t) {
  const entries = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => (entries.has(key) ? entries.get(key) : null),
      setItem: (key, value) => entries.set(key, value),
      removeItem: (key) => { entries.delete(key); },
    },
  };
  t.after(() => { delete globalThis.window; });
  return entries;
}

const SESSION = "01a0a1ab-db1a-7295-99e9-83c197d6b3d2";
const WORKTREE_A = "/Users/x/project";
const WORKTREE_B = "/Users/x/project-worktrees/feature";

function comment(overrides = {}) {
  return {
    id: "c1", path: "notes.txt", side: "additions", startLine: 2, endLine: 2,
    revision: "rev-1", body: "a note", createdAt: "t0", updatedAt: "t0", ...overrides,
  };
}

/**
 * A panel that holds an owner and a list, the way the real one does, so a test
 * can open an editor, change owner underneath it, and then let the editor
 * save — which is the sequence that filed notes in the wrong place.
 */
function panel(owner) {
  return {
    owner,
    held: readReviewComments(owner),
    /** Whoever is on screen now; the editor captured the owner it started in. */
    moveTo(next) {
      this.owner = next;
      this.held = readReviewComments(next);
    },
    save(capturedOwner, apply) {
      const next = mutateReviewComments(capturedOwner, this.owner, apply);
      if (next) this.held = next;
      return next;
    },
  };
}

test("one Session working in two worktrees keeps two sets of comments", (t) => {
  useStorage(t);
  const inA = reviewCommentOwnerKey({ sessionId: SESSION, cwd: WORKTREE_A });
  const inB = reviewCommentOwnerKey({ sessionId: SESSION, cwd: WORKTREE_B });
  assert.notEqual(inA, inB);

  writeReviewComments(inA, [comment()]);
  assert.deepEqual(readReviewComments(inB), []);
  assert.deepEqual(readReviewComments(inA).map((entry) => entry.id), ["c1"]);
});

test("a comment begun beside one Session is refused after the panel moves to another", (t) => {
  const entries = useStorage(t);
  const beside = reviewCommentOwnerKey({ sessionId: "session-a", cwd: WORKTREE_A });
  const after = reviewCommentOwnerKey({ sessionId: "session-b", cwd: WORKTREE_A });
  const view = panel(beside);

  // The editor opens here, and the human switches Session before saving.
  const capturedOwner = view.owner;
  view.moveTo(after);
  const written = view.save(capturedOwner, (current) => upsertReviewComment(current, comment()));

  assert.equal(written, null);
  assert.deepEqual(readReviewComments(beside), [], "the note was not filed under the Session it was begun beside");
  assert.deepEqual(readReviewComments(after), [], "and never under the one that replaced it");
  assert.equal(entries.size, 0);

  // Written for the owner actually on screen, it lands.
  assert.deepEqual(view.save(after, (current) => upsertReviewComment(current, comment()))?.map((entry) => entry.id), ["c1"]);
  assert.deepEqual(readReviewComments(after).map((entry) => entry.id), ["c1"]);
  assert.deepEqual(readReviewComments(beside), []);
});

test("the same move across worktrees is refused even though the Session did not change", (t) => {
  useStorage(t);
  const inA = reviewCommentOwnerKey({ sessionId: SESSION, cwd: WORKTREE_A });
  const inB = reviewCommentOwnerKey({ sessionId: SESSION, cwd: WORKTREE_B });
  const view = panel(inA);

  const capturedOwner = view.owner;
  view.moveTo(inB);
  assert.equal(view.save(capturedOwner, (current) => upsertReviewComment(current, comment())), null);
  assert.deepEqual(readReviewComments(inA), []);
  assert.deepEqual(readReviewComments(inB), []);
});

test("a change is folded into what storage holds, not into the list the panel was showing", (t) => {
  useStorage(t);
  const owner = reviewCommentOwnerKey({ sessionId: SESSION, cwd: WORKTREE_A });
  writeReviewComments(owner, [comment()]);
  const view = panel(owner);

  // Something else adds a second comment after this panel read its list.
  writeReviewComments(owner, [comment(), comment({ id: "c2", body: "later" })]);
  assert.deepEqual(view.held.map((entry) => entry.id), ["c1"], "the panel is holding the older list");

  view.save(owner, (current) => upsertReviewComment(current, comment({ id: "c3", body: "newest" })));
  assert.deepEqual(readReviewComments(owner).map((entry) => entry.id), ["c1", "c2", "c3"], "nothing was clobbered");

  view.save(owner, (current) => removeReviewComment(current, "c1"));
  assert.deepEqual(readReviewComments(owner).map((entry) => entry.id), ["c2", "c3"]);
});

test("a directory spelt differently is still one owner", () => {
  assert.equal(canonicalReviewCwd("/Users/x/project/"), "/Users/x/project");
  assert.equal(canonicalReviewCwd("C:\\Users\\x\\project"), "C:/Users/x/project");
  assert.equal(
    reviewCommentOwnerKey({ sessionId: SESSION, cwd: "/Users/x/project/" }),
    reviewCommentOwnerKey({ sessionId: SESSION, cwd: "/Users/x/project" }),
  );
});

test("comments stored under the older Session-only key are left where they are", (t) => {
  const entries = useStorage(t);
  // An unreleased build wrote this. Which directory it belongs to cannot be
  // known, so it is neither read into a new owner nor deleted.
  entries.set(`omp-review-comments:session:${SESSION}`, JSON.stringify([comment({ id: "legacy" })]));

  const owner = reviewCommentOwnerKey({ sessionId: SESSION, cwd: WORKTREE_A });
  assert.deepEqual(readReviewComments(owner), []);
  writeReviewComments(owner, [comment()]);
  assert.equal(entries.has(`omp-review-comments:session:${SESSION}`), true);
  assert.deepEqual(JSON.parse(entries.get(`omp-review-comments:session:${SESSION}`)).map((entry) => entry.id), ["legacy"]);
});

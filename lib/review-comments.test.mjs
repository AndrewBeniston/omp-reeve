import assert from "node:assert/strict";
import test from "node:test";
import {
  placedCommentsForFile,
  reviewFileClaimsComments,
  removeReviewComment,
  reviewCommentOwnerKey,
  reviewCommentRangeLabel,
  reviewCommentsComposerText,
  upsertReviewComment,
} from "./review-comments.ts";

function comment(overrides = {}) {
  return {
    id: "c1",
    path: "selected/notes.txt",
    side: "additions",
    startLine: 12,
    endLine: 12,
    revision: "rev-1",
    body: "rename this",
    createdAt: "2026-09-14T10:00:00.000Z",
    updatedAt: "2026-09-14T10:00:00.000Z",
    ...overrides,
  };
}

test("comments belong to a Session working in one directory, or to the directory alone", () => {
  assert.equal(reviewCommentOwnerKey({ sessionId: "abc", cwd: "/repo" }), "session:abc@/repo");
  // The same Session in another worktree of the same Project is another owner.
  assert.notEqual(
    reviewCommentOwnerKey({ sessionId: "abc", cwd: "/repo" }),
    reviewCommentOwnerKey({ sessionId: "abc", cwd: "/repo-worktrees/feature" }),
  );
  // The same directory in two Sessions is two different owners, which is what
  // stops one Session reading notes written beside another.
  assert.notEqual(
    reviewCommentOwnerKey({ sessionId: "abc", cwd: "/repo" }),
    reviewCommentOwnerKey({ sessionId: "def", cwd: "/repo" }),
  );
  assert.equal(reviewCommentOwnerKey({ sessionId: null, cwd: "/repo" }), "project:/repo");
  assert.notEqual(
    reviewCommentOwnerKey({ sessionId: null, cwd: "/repo" }),
    reviewCommentOwnerKey({ sessionId: null, cwd: "/repo/worktree" }),
  );
});

test("saving a comment adds it once and editing it replaces it in place", () => {
  const first = upsertReviewComment([], comment());
  assert.equal(first.length, 1);
  const edited = upsertReviewComment(first, comment({ body: "rename it to notes", updatedAt: "2026-09-14T11:00:00.000Z" }));
  assert.equal(edited.length, 1);
  assert.equal(edited[0].body, "rename it to notes");
  assert.equal(edited[0].createdAt, "2026-09-14T10:00:00.000Z");

  const two = upsertReviewComment(edited, comment({ id: "c2", path: "other.txt" }));
  assert.deepEqual(placedCommentsForFile(two.map(anchored), "other.txt").map((entry) => entry.comment.id), ["c2"]);
  assert.deepEqual(removeReviewComment(two, "c1").map((entry) => entry.id), ["c2"]);
});

/** A comment sitting where it was written. */
function anchored(entry) {
  return { comment: entry, placement: { state: "anchored", startLine: entry.startLine, endLine: entry.endLine } };
}

test("the composer text names each comment's lines the way the Session resolves them", () => {
  const toSessionPath = (path) => path.replace(/^selected\//, "");
  const notes = reviewCommentsComposerText([anchored(comment()), anchored(comment({ id: "c2", startLine: 20, endLine: 24, body: "split this" }))], "notes", toSessionPath);
  assert.equal(notes, [
    "Review comments:",
    "- @notes.txt:12 — rename this",
    "- @notes.txt:20-24 — split this",
    "",
  ].join("\n"));

  const changes = reviewCommentsComposerText([anchored(comment())], "changes", toSessionPath);
  assert.match(changes, /^Please make these changes from my review:\n/);
  assert.match(changes, /@notes\.txt:12 — rename this/);

  // Nothing to hand over produces nothing to insert.
  assert.equal(reviewCommentsComposerText([], "notes", toSessionPath), "");
});

test("a comment that moved is handed over by the lines it is on now", () => {
  const toSessionPath = (path) => path.replace(/^selected\//, "");
  const moved = reviewCommentsComposerText(
    [{ comment: comment(), placement: { state: "moved", startLine: 14, endLine: 14 } }], "notes", toSessionPath,
  );
  assert.match(moved, /@notes\.txt:14 — rename this/);
  // Never the lines it was written against: other code holds them now.
  assert.doesNotMatch(moved, /:12/);
});

test("a detached comment is handed over by its file, saying where it was written", () => {
  const toSessionPath = (path) => path.replace(/^selected\//, "");
  const detached = reviewCommentsComposerText(
    [{ comment: comment(), placement: { state: "detached", reason: "gone" } }], "notes", toSessionPath,
  );
  assert.equal(detached, [
    "Review comments:",
    "- @notes.txt — rename this (written against line 12, which this review cannot show now)",
    "",
  ].join("\n"));
});

test("a file that draws no diff does not claim its comments", () => {
  const drawn = { viewed: false, previewable: false, binary: false, additions: 3, deletions: 1 };
  assert.equal(reviewFileClaimsComments(drawn), true);
  // Marked viewed, the section collapses to its heading and the diff with it.
  // Its comments have to be shown elsewhere rather than leave with the diff.
  assert.equal(reviewFileClaimsComments({ ...drawn, viewed: true }), false);
  assert.equal(reviewFileClaimsComments({ ...drawn, conflicted: true }), false);
  assert.equal(reviewFileClaimsComments({ ...drawn, previewable: true }), false);
  assert.equal(reviewFileClaimsComments({ ...drawn, binary: true }), false);
  // A rename or a mode change draws a note and no diff.
  assert.equal(reviewFileClaimsComments({ ...drawn, additions: 0, deletions: 0 }), false);
});

test("a comment says which lines it is about", () => {
  assert.equal(reviewCommentRangeLabel(comment()), "Line 12");
  assert.equal(reviewCommentRangeLabel(comment({ startLine: 3, endLine: 9 })), "Lines 3–9");
});

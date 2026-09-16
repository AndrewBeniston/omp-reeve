import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { mismatchedHunkTargets } from "./review-hunk-binding.ts";
import { readReviewDiff } from "./review-git.ts";
import { reviewFilesFromPatch } from "./review-files.ts";
import { patchHunks } from "./review-patch.ts";

/**
 * A file whose two changes are far apart, one of them whitespace only.
 *
 * Read exactly it has two hunks; read while ignoring whitespace it has one,
 * and that one is the second. So position zero names a different hunk in each
 * reading, which is the mistake this guard exists to catch.
 */
function fixture(t, body) {
  const cwd = mkdtempSync(path.join(tmpdir(), "reeve-binding-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", ["-C", cwd, ...args], { stdio: "pipe" });
  const lines = (reindented, revised) => Array.from({ length: 60 }, (_, n) => {
    if (n === 4) return reindented ? "    line 5\n" : "line 5\n";
    if (n === 49) return revised ? "line fifty, revised\n" : "line 50\n";
    return `line ${n + 1}\n`;
  }).join("");
  writeFileSync(path.join(cwd, "file.txt"), body ? body.before : lines(false, false));
  git("init", "-qb", "main");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.invalid");
  git("add", ".");
  git("commit", "-qm", "base");
  writeFileSync(path.join(cwd, "file.txt"), body ? body.after : lines(true, true));
  return cwd;
}

const UNSTAGED = { kind: "unstaged" };
const filesOf = (diff) => reviewFilesFromPatch(diff.patch, diff.conflictedFiles);

test("the same position names a different hunk in each reading", async (t) => {
  const cwd = fixture(t);
  const exact = filesOf(await readReviewDiff(cwd, UNSTAGED));
  const hidden = filesOf(await readReviewDiff(cwd, UNSTAGED, { ignoreWhitespace: true }));

  assert.equal(patchHunks(exact[0].patch).length, 2);
  assert.equal(patchHunks(hidden[0].patch).length, 1);
  assert.notEqual(
    patchHunks(hidden[0].patch)[0],
    patchHunks(exact[0].patch)[0],
    "position zero would land on the wrong hunk",
  );
});

test("a hunk chosen from the filtered reading is refused, not applied to its neighbour", async (t) => {
  const cwd = fixture(t);
  const exact = filesOf(await readReviewDiff(cwd, UNSTAGED));
  const hidden = filesOf(await readReviewDiff(cwd, UNSTAGED, { ignoreWhitespace: true }));
  const shown = patchHunks(hidden[0].patch)[0];

  assert.deepEqual(
    mismatchedHunkTargets(exact, [{ path: "file.txt", hunkIndex: 0, hunkText: shown }]),
    ["file.txt"],
  );
});

test("a hunk chosen from the same reading the server has is allowed through", async (t) => {
  const cwd = fixture(t);
  const exact = filesOf(await readReviewDiff(cwd, UNSTAGED));
  const targets = patchHunks(exact[0].patch).map((hunk, hunkIndex) => ({ path: "file.txt", hunkIndex, hunkText: hunk }));

  assert.deepEqual(mismatchedHunkTargets(exact, targets), []);
});

test("an unnamed hunk, an unknown file and a position past the end all fail closed", async (t) => {
  const cwd = fixture(t);
  const exact = filesOf(await readReviewDiff(cwd, UNSTAGED));
  const named = patchHunks(exact[0].patch)[0];

  assert.deepEqual(mismatchedHunkTargets(exact, [{ path: "file.txt", hunkIndex: 0 }]), ["file.txt"]);
  assert.deepEqual(mismatchedHunkTargets(exact, [{ path: "gone.txt", hunkIndex: 0, hunkText: named }]), ["gone.txt"]);
  assert.deepEqual(mismatchedHunkTargets(exact, [{ path: "file.txt", hunkIndex: 9, hunkText: named }]), ["file.txt"]);
  // A whole-file target names no hunk, so there is nothing here to confirm.
  assert.deepEqual(mismatchedHunkTargets(exact, [{ path: "file.txt" }]), []);
});

/*
 * One hunk, one position, and the same @@ line in both readings — with
 * different content inside it. Reindenting the first line and rewriting the
 * third leaves four lines against four either way, so a guard that compares
 * headers sees no difference and lets a hunk through that the human never saw.
 */
const COLLIDING = {
  before: "alpha\nbravo\ncharlie\ndelta\n",
  after: "  alpha\nbravo\nchanged\ndelta\n",
};

test("a hunk whose header is unchanged but whose body is not is still refused", async (t) => {
  const cwd = fixture(t, COLLIDING);
  const exact = filesOf(await readReviewDiff(cwd, UNSTAGED));
  const hidden = filesOf(await readReviewDiff(cwd, UNSTAGED, { ignoreWhitespace: true }));
  const exactHunk = patchHunks(exact[0].patch)[0];
  const shownHunk = patchHunks(hidden[0].patch)[0];

  // The collision itself: one hunk each, and the same header line.
  assert.equal(patchHunks(exact[0].patch).length, 1);
  assert.equal(patchHunks(hidden[0].patch).length, 1);
  assert.equal(shownHunk.split("\n", 1)[0], exactHunk.split("\n", 1)[0]);
  assert.notEqual(shownHunk, exactHunk, "the bodies differ, which is the whole point");

  assert.deepEqual(
    mismatchedHunkTargets(exact, [{ path: "file.txt", hunkIndex: 0, hunkText: shownHunk }]),
    ["file.txt"],
  );
});

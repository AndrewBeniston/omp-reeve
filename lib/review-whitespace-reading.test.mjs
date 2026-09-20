import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { applyReviewChange, readReviewDiff } from "./review-git.ts";
import { readReviewFileSides } from "./review-file-contents.ts";

/**
 * A working tree holding one real edit beside one whitespace-only edit.
 *
 * Both are unstaged, so staging is the destructive operation under test and
 * the index can be read back afterwards to see whether it actually moved.
 */

/**
 * The file that matters carries both kinds of edit at once.
 *
 * A file whose changes are all real hashes the same under either reading, so
 * it cannot show this bug at all. Only a file that is partly reindented and
 * partly rewritten has a different patch under each reading, and that is the
 * file an operation would have been refused for.
 */
const baseLines = (revised, reindented) => Array.from({ length: 30 }, (_, n) => {
  if (n === 14) return revised ? "line fifteen, revised\n" : "line 15\n";
  if (n === 4) return reindented ? "    line 5\n" : "line 5\n";
  return `line ${n + 1}\n`;
}).join("");

function fixture(t) {
  const cwd = mkdtempSync(path.join(tmpdir(), "reeve-whitespace-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", ["-C", cwd, ...args], { stdio: "pipe" });
  const write = (name, body) => writeFileSync(path.join(cwd, name), body);
  git("init", "-qb", "main");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.invalid");
  write("real.txt", baseLines(false, false));
  write("spaced.txt", "value = 1\n");
  git("add", ".");
  git("commit", "-qm", "base");
  write("real.txt", baseLines(true, true));
  write("spaced.txt", "value   =   1\n");
  return { cwd, git };
}

const UNSTAGED = { kind: "unstaged" };

test("a file's digest is the exact reading's, whatever the panel is showing", async (t) => {
  const { cwd } = fixture(t);
  const exact = await readReviewDiff(cwd, UNSTAGED);
  const hidden = await readReviewDiff(cwd, UNSTAGED, { ignoreWhitespace: true });

  assert.match(exact.patch, /spaced\.txt/, "the exact reading shows the whitespace-only change");
  assert.doesNotMatch(hidden.patch, /spaced\.txt/, "the whitespace-ignoring reading hides it");
  // The reindented line is present in one reading and absent from the other,
  // so this file genuinely reads differently under each.
  assert.match(exact.patch, /^\+ {4}line 5$/m);
  assert.doesNotMatch(hidden.patch, /^\+ {4}line 5$/m);
  assert.equal(hidden.fileRevisions["real.txt"], exact.fileRevisions["real.txt"]);
  // The hidden file keeps a digest too: it is still changed, just not shown.
  assert.equal(hidden.fileRevisions["spaced.txt"], exact.fileRevisions["spaced.txt"]);
});

test("staging a file while whitespace is hidden actually stages it", async (t) => {
  const { cwd, git } = fixture(t);
  const hidden = await readReviewDiff(cwd, UNSTAGED, { ignoreWhitespace: true });

  const result = await applyReviewChange(cwd, "stage", UNSTAGED, [
    { path: "real.txt", revision: hidden.fileRevisions["real.txt"] },
  ]);

  assert.deepEqual(result.stale, [], "the operation was not refused as stale");
  assert.equal(result.status, "success");
  assert.deepEqual(result.applied, ["real.txt"]);
  // Git itself, not the response: the index is what the claim is about.
  const staged = git("diff", "--cached", "--name-only").toString().trim().split("\n").filter(Boolean);
  assert.deepEqual(staged, ["real.txt"]);
  assert.match(git("diff", "--cached", "--", "real.txt").toString(), /line fifteen, revised/);
});

test("expanding context while whitespace is hidden reads the file rather than refusing", async (t) => {
  const { cwd } = fixture(t);
  const hidden = await readReviewDiff(cwd, UNSTAGED, { ignoreWhitespace: true });

  const sides = await readReviewFileSides(cwd, UNSTAGED, "real.txt", { revision: hidden.fileRevisions["real.txt"] });

  assert.equal(sides.status, "ready");
  assert.match(sides.newContents, /line fifteen, revised/);
  assert.match(sides.oldContents, /line 15/);
});

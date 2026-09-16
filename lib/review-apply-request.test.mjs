import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { resolveReviewApplyRequest } from "./review-apply-request.ts";
import { applyReviewChange, readReviewDiff } from "./review-git.ts";
import { reviewFilesFromPatch } from "./review-files.ts";
import { patchHunks } from "./review-patch.ts";

/**
 * Operating on a hunk drawn while whitespace was hidden, checked by reading
 * Git back rather than by trusting the answer the operation gave.
 *
 * The fixture is one file changed in four places: two content changes far
 * apart, and a whitespace-only change beside each. Read exactly that is one
 * hunk; read with whitespace hidden it is two, and neither position nor header
 * carries over between the readings. A second file is edited and never named,
 * so every case can also say what did not move.
 */
const BEFORE = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel", "india", "juliet", "kilo", "lima", "mike"];
const AFTER = ["  alpha", "bravo", "CHANGED", "delta", "echo", "foxtrot", "    golf", "hotel", "india", "juliet", "kilo", "ALTERED", "mike"];
const UNSTAGED = { kind: "unstaged" };

function fixture(t) {
  const cwd = mkdtempSync(path.join(tmpdir(), "reeve-apply-request-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: "pipe" });
  const write = (name, lines) => writeFileSync(path.join(cwd, name), `${lines.join("\n")}\n`);
  write("file.txt", BEFORE);
  write("other.txt", ["untouched by every operation here"]);
  git("init", "-qb", "main");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.invalid");
  git("add", ".");
  git("commit", "-qm", "base");
  write("file.txt", AFTER);
  write("other.txt", ["edited, and never named in an operation"]);
  return { cwd, git, read: (name) => readFileSync(path.join(cwd, name), "utf8") };
}

/** What the panel would send for one hunk of the reading that hides whitespace. */
async function displayedTarget(cwd, scope, filePath, hunkIndex) {
  const diff = await readReviewDiff(cwd, scope, { ignoreWhitespace: true });
  const file = reviewFilesFromPatch(diff.patch, diff.conflictedFiles).find((entry) => entry.path === filePath);
  return { path: filePath, revision: diff.fileRevisions[filePath], hunkIndex, hunkText: patchHunks(file.patch)[hunkIndex] };
}

async function operate(cwd, operation, scope, targets, options) {
  const resolution = await resolveReviewApplyRequest(cwd, scope, targets, options);
  if (resolution.stale.length) return { status: "stale", stale: resolution.stale, applied: [], skipped: [], failed: [] };
  return await applyReviewChange(cwd, operation, scope, resolution.targets);
}

test("the two readings disagree about both position and header, which is the hazard", async (t) => {
  const { cwd } = fixture(t);
  const exact = await readReviewDiff(cwd, UNSTAGED);
  const hidden = await readReviewDiff(cwd, UNSTAGED, { ignoreWhitespace: true });
  const exactHunks = patchHunks(reviewFilesFromPatch(exact.patch, []).find((file) => file.path === "file.txt").patch);
  const hiddenHunks = patchHunks(reviewFilesFromPatch(hidden.patch, []).find((file) => file.path === "file.txt").patch);

  assert.equal(exactHunks.length, 1);
  assert.equal(hiddenHunks.length, 2);
  assert.notEqual(hiddenHunks[0].split("\n", 1)[0], exactHunks[0].split("\n", 1)[0]);
});

test("staging a hunk drawn with whitespace hidden stages that hunk and nothing else", async (t) => {
  const { cwd, git, read } = fixture(t);
  const target = await displayedTarget(cwd, UNSTAGED, "file.txt", 0);

  const result = await operate(cwd, "stage", UNSTAGED, [target], { hideWhitespace: true });
  assert.equal(result.status, "success");

  // Read back from Git: the index carries the change that was drawn.
  const staged = git("diff", "--cached", "--no-color", "--unified=0");
  assert.match(staged, /^\+CHANGED$/m);
  // And not the change further down the file, which was drawn as its own hunk.
  assert.doesNotMatch(staged, /ALTERED/);
  // Nor the whitespace change outside the drawn hunk, which the panel showed
  // as neither a change nor context.
  assert.doesNotMatch(staged, /golf/);
  assert.match(git("diff", "--no-color"), /^\+ALTERED$/m);
  // The working tree is untouched by staging, and the file never named is too.
  assert.equal(read("file.txt"), `${AFTER.join("\n")}\n`);
  assert.match(git("status", "--porcelain", "--", "other.txt"), /^ M other\.txt$/m);
});

test("the second drawn hunk resolves to its own lines, not to the first", async (t) => {
  const { cwd, git } = fixture(t);
  const target = await displayedTarget(cwd, UNSTAGED, "file.txt", 1);

  assert.equal((await operate(cwd, "stage", UNSTAGED, [target], { hideWhitespace: true })).status, "success");

  const staged = git("diff", "--cached", "--no-color", "--unified=0");
  assert.match(staged, /^\+ALTERED$/m);
  assert.doesNotMatch(staged, /CHANGED/);
});

test("reverting a hunk drawn with whitespace hidden restores only its lines", async (t) => {
  const { cwd, git, read } = fixture(t);
  const target = await displayedTarget(cwd, UNSTAGED, "file.txt", 0);

  assert.equal((await operate(cwd, "revert", UNSTAGED, [target], { hideWhitespace: true })).status, "success");

  const lines = read("file.txt").split("\n");
  assert.equal(lines[2], "charlie", "the drawn change is gone");
  /*
   * The reindent on line one sat inside the hunk that was drawn, where the
   * panel shows that line in its new form as context. It belongs to the region
   * that was reverted and goes back with it; the reindent further down, which
   * sat outside the drawn hunk, does not.
   */
  assert.equal(lines[0], "alpha");
  assert.equal(lines[11], "ALTERED", "the change below it is still here");
  assert.equal(lines[6], "    golf", "so is the whitespace change outside the hunk");
  assert.match(git("status", "--porcelain", "--", "other.txt"), /^ M other\.txt$/m);
});

test("a hunk named against content that has since changed is refused whole", async (t) => {
  const { cwd, read } = fixture(t);
  const target = await displayedTarget(cwd, UNSTAGED, "file.txt", 0);
  writeFileSync(path.join(cwd, "file.txt"), `${[...AFTER, "appended after the panel drew it"].join("\n")}\n`);

  const result = await operate(cwd, "stage", UNSTAGED, [target], { hideWhitespace: true });

  assert.equal(result.status, "stale");
  assert.deepEqual(result.stale, ["file.txt"]);
  assert.equal(read("file.txt").endsWith("appended after the panel drew it\n"), true);
});

test("a hunk drawn in one reading is refused when the request claims the other", async (t) => {
  const { cwd, git } = fixture(t);
  const target = await displayedTarget(cwd, UNSTAGED, "file.txt", 0);

  // The same request, without saying the panel was hiding whitespace: the
  // position names a different hunk in the exact reading, so it cannot be
  // confirmed and nothing is applied.
  const result = await operate(cwd, "stage", UNSTAGED, [target], { hideWhitespace: false });

  assert.equal(result.status, "stale");
  assert.deepEqual(result.stale, ["file.txt"]);
  assert.equal(git("diff", "--cached", "--no-color"), "");
});

test("a whole-file target is passed through without a hunk to resolve", async (t) => {
  const { cwd, git } = fixture(t);
  const diff = await readReviewDiff(cwd, UNSTAGED, { ignoreWhitespace: true });
  const target = { path: "file.txt", revision: diff.fileRevisions["file.txt"] };

  assert.equal((await operate(cwd, "stage", UNSTAGED, [target], { hideWhitespace: true })).status, "success");

  const staged = git("diff", "--cached", "--no-color", "--unified=0");
  assert.match(staged, /^\+CHANGED$/m);
  assert.match(staged, /^\+ALTERED$/m);
  assert.match(git("status", "--porcelain", "--", "other.txt"), /^ M other\.txt$/m);
});

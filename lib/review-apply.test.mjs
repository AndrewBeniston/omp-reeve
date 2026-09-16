import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { applyReviewChange, readReviewDiff } from "./review-git.ts";

function fixture(t) {
  const cwd = mkdtempSync(path.join(tmpdir(), "reeve-apply-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    env: { ...process.env, GIT_AUTHOR_NAME: "Test", GIT_AUTHOR_EMAIL: "test@example.invalid", GIT_COMMITTER_NAME: "Test", GIT_COMMITTER_EMAIL: "test@example.invalid" },
  }).trim();
  git("init", "-b", "main");
  const write = (name, content) => writeFileSync(path.join(cwd, name), content);
  const read = (name) => readFileSync(path.join(cwd, name), "utf8");
  return { cwd, git, write, read };
}

/** A target for every file in a scope, carrying the digest Review would be showing. */
async function targetsFor(cwd, scope) {
  const diff = await readReviewDiff(cwd, scope);
  return Object.entries(diff.fileRevisions).map(([filePath, revision]) => ({ path: filePath, revision }));
}

async function targetFor(cwd, scope, filePath, hunkIndex) {
  const diff = await readReviewDiff(cwd, scope);
  return { path: filePath, revision: diff.fileRevisions[filePath], ...(hunkIndex === undefined ? {} : { hunkIndex }) };
}

const NUMBERED = (values) => `${values.join("\n")}\n`;
const BASE_LINES = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];

test("staging one hunk moves that hunk alone into the index", async (t) => {
  const { cwd, git, write, read } = fixture(t);
  write("file.txt", NUMBERED(BASE_LINES));
  git("add", "."); git("commit", "-qm", "base");
  const edited = [...BASE_LINES];
  edited[0] = "one edited";
  edited[11] = "twelve edited";
  write("file.txt", NUMBERED(edited));

  const target = await targetFor(cwd, { kind: "unstaged" }, "file.txt", 0);
  const result = await applyReviewChange(cwd, "stage", { kind: "unstaged" }, [target]);
  assert.deepEqual(result, { status: "success", applied: ["file.txt"], skipped: [], failed: [], stale: [] });

  // The first hunk is staged, the second is still only in the working tree,
  // and the file on disk is untouched by the operation.
  const staged = git("diff", "--cached", "-U0");
  assert.match(staged, /\+one edited/);
  assert.doesNotMatch(staged, /twelve edited/);
  assert.match(git("diff", "-U0"), /\+twelve edited/);
  assert.equal(read("file.txt"), NUMBERED(edited));
});

test("unstaging a file returns it to the working tree without losing the edit", async (t) => {
  const { cwd, git, write, read } = fixture(t);
  write("file.txt", "original\n");
  git("add", "."); git("commit", "-qm", "base");
  write("file.txt", "edited\n");
  git("add", ".");

  const target = await targetFor(cwd, { kind: "staged" }, "file.txt");
  assert.deepEqual(await applyReviewChange(cwd, "unstage", { kind: "staged" }, [target]),
    { status: "success", applied: ["file.txt"], skipped: [], failed: [], stale: [] });
  assert.equal(git("diff", "--cached", "--name-only"), "");
  assert.equal(git("diff", "--name-only"), "file.txt");
  assert.equal(read("file.txt"), "edited\n");
});

test("reverting one hunk keeps every unrelated edit in the file and the repository", async (t) => {
  const { cwd, git, write, read } = fixture(t);
  write("file.txt", NUMBERED(BASE_LINES));
  write("other.txt", "untouched\n");
  git("add", "."); git("commit", "-qm", "base");
  const edited = [...BASE_LINES];
  edited[0] = "one edited";
  edited[11] = "twelve edited";
  write("file.txt", NUMBERED(edited));
  write("other.txt", "edited elsewhere\n");

  const target = await targetFor(cwd, { kind: "unstaged" }, "file.txt", 1);
  assert.deepEqual(await applyReviewChange(cwd, "revert", { kind: "unstaged" }, [target]),
    { status: "success", applied: ["file.txt"], skipped: [], failed: [], stale: [] });

  const kept = [...BASE_LINES];
  kept[0] = "one edited";
  assert.equal(read("file.txt"), NUMBERED(kept));
  assert.equal(read("other.txt"), "edited elsewhere\n");
});

test("a digest from a diff that has moved on refuses the whole operation", async (t) => {
  const { cwd, git, write, read } = fixture(t);
  write("file.txt", "original\n");
  git("add", "."); git("commit", "-qm", "base");
  write("file.txt", "first edit\n");
  const stale = await targetFor(cwd, { kind: "unstaged" }, "file.txt");

  // The file changes again before the human's click reaches the server.
  write("file.txt", "second edit\n");
  const result = await applyReviewChange(cwd, "stage", { kind: "unstaged" }, [stale]);
  assert.deepEqual(result, { status: "stale", applied: [], skipped: [], failed: [], stale: ["file.txt"] });
  assert.equal(git("diff", "--cached", "--name-only"), "");
  assert.equal(read("file.txt"), "second edit\n");

  // The same click with the current digest is accepted.
  const fresh = await targetFor(cwd, { kind: "unstaged" }, "file.txt");
  assert.equal((await applyReviewChange(cwd, "stage", { kind: "unstaged" }, [fresh])).status, "success");
  assert.match(git("diff", "--cached"), /\+second edit/);
});

test("a section names the conflicted file it could not move instead of reporting a clean success", async (t) => {
  const { cwd, git, write } = fixture(t);
  write("conflict.txt", "base\n"); write("plain.txt", "base\n");
  git("add", "."); git("commit", "-qm", "base");
  git("checkout", "-qb", "other");
  write("conflict.txt", "other side\n"); git("commit", "-qam", "other side");
  git("checkout", "-q", "main");
  write("conflict.txt", "this side\n"); git("commit", "-qam", "this side");
  assert.throws(() => git("merge", "other", "--no-edit"));
  write("plain.txt", "edited\n");

  const diff = await readReviewDiff(cwd, { kind: "unstaged" });
  const targets = [
    { path: "conflict.txt", revision: diff.fileRevisions["conflict.txt"] },
    { path: "plain.txt", revision: diff.fileRevisions["plain.txt"] },
  ];
  // A conflicted file is addressable, which is what keeps it in the report.
  assert.ok(diff.fileRevisions["conflict.txt"]);
  const result = await applyReviewChange(cwd, "stage", { kind: "unstaged" }, targets);
  assert.equal(result.status, "partial");
  assert.deepEqual(result.applied, ["plain.txt"]);
  assert.deepEqual(result.failed, []);
  assert.equal(result.skipped.length, 1);
  assert.equal(result.skipped[0].path, "conflict.txt");
  assert.match(result.skipped[0].message, /merge conflicts/);

  // The ordinary file still moved, and the conflicted one is untouched: it is
  // unmerged before the operation and unmerged after it.
  assert.match(git("diff", "--cached", "--name-only"), /plain\.txt/);
  assert.match(git("ls-files", "--unmerged"), /conflict\.txt/);
});

test("a conflicted file alone is a failure, never a success with nothing to show for it", async (t) => {
  const { cwd, git, write } = fixture(t);
  write("conflict.txt", "base\n"); git("add", "."); git("commit", "-qm", "base");
  git("checkout", "-qb", "other");
  write("conflict.txt", "other side\n"); git("commit", "-qam", "other side");
  git("checkout", "-q", "main");
  write("conflict.txt", "this side\n"); git("commit", "-qam", "this side");
  assert.throws(() => git("merge", "other", "--no-edit"));

  const target = await targetFor(cwd, { kind: "unstaged" }, "conflict.txt");
  const result = await applyReviewChange(cwd, "stage", { kind: "unstaged" }, [target]);
  assert.equal(result.status, "error");
  assert.deepEqual(result.applied, []);
  assert.equal(result.skipped[0].path, "conflict.txt");
});

test("an untracked file can be staged whole and reverted away", async (t) => {
  const { cwd, git, write } = fixture(t);
  write("tracked.txt", "base\n");
  git("add", "."); git("commit", "-qm", "base");
  write("new.txt", "brand new\n");

  const staged = await targetFor(cwd, { kind: "unstaged" }, "new.txt");
  assert.equal((await applyReviewChange(cwd, "stage", { kind: "unstaged" }, [staged])).status, "success");
  assert.equal(git("diff", "--cached", "--name-only"), "new.txt");

  const unstage = await targetFor(cwd, { kind: "staged" }, "new.txt");
  assert.equal((await applyReviewChange(cwd, "unstage", { kind: "staged" }, [unstage])).status, "success");
  assert.equal(git("diff", "--cached", "--name-only"), "");
  assert.ok(existsSync(path.join(cwd, "new.txt")));

  const revert = await targetFor(cwd, { kind: "unstaged" }, "new.txt");
  assert.equal((await applyReviewChange(cwd, "revert", { kind: "unstaged" }, [revert])).status, "success");
  assert.equal(existsSync(path.join(cwd, "new.txt")), false);
});

test("a binary file moves by path because its patch carries no content", async (t) => {
  const { cwd, git, write } = fixture(t);
  write("image.bin", Buffer.from([0, 1, 2, 3]));
  git("add", "."); git("commit", "-qm", "base");
  write("image.bin", Buffer.from([4, 5, 6, 7]));

  const staged = await targetFor(cwd, { kind: "unstaged" }, "image.bin");
  assert.equal((await applyReviewChange(cwd, "stage", { kind: "unstaged" }, [staged])).status, "success");
  assert.equal(git("diff", "--cached", "--name-only"), "image.bin");

  const unstaged = await targetFor(cwd, { kind: "staged" }, "image.bin");
  assert.equal((await applyReviewChange(cwd, "unstage", { kind: "staged" }, [unstaged])).status, "success");
  assert.equal(git("diff", "--cached", "--name-only"), "");

  const reverted = await targetFor(cwd, { kind: "unstaged" }, "image.bin");
  assert.equal((await applyReviewChange(cwd, "revert", { kind: "unstaged" }, [reverted])).status, "success");
  assert.deepEqual([...readFileSync(path.join(cwd, "image.bin"))], [0, 1, 2, 3]);
});

test("reverting an uncommitted file takes the index back with the working tree", async (t) => {
  const { cwd, git, write, read } = fixture(t);
  write("file.txt", "original\n");
  git("add", "."); git("commit", "-qm", "base");
  write("file.txt", "staged\n"); git("add", ".");

  const target = await targetFor(cwd, { kind: "uncommitted" }, "file.txt");
  assert.equal((await applyReviewChange(cwd, "revert", { kind: "uncommitted" }, [target])).status, "success");
  assert.equal(git("diff", "--cached", "--name-only"), "");
  assert.equal(git("diff", "--name-only"), "");
  assert.equal(read("file.txt"), "original\n");
});

test("staging from the combined view moves the path, and a stale digest still refuses it", async (t) => {
  const { cwd, git, write, read } = fixture(t);
  write("file.txt", "original\n");
  git("add", "."); git("commit", "-qm", "base");
  write("file.txt", "edited\n");

  // The combined view's patch runs from the commit, not from the index, so
  // staging it means the path moves the way git add moves it.
  const stale = await targetFor(cwd, { kind: "uncommitted" }, "file.txt");
  write("file.txt", "edited again\n");
  assert.equal((await applyReviewChange(cwd, "stage", { kind: "uncommitted" }, [stale])).status, "stale");
  assert.equal(git("diff", "--cached", "--name-only"), "");

  const fresh = await targetFor(cwd, { kind: "uncommitted" }, "file.txt");
  assert.equal((await applyReviewChange(cwd, "stage", { kind: "uncommitted" }, [fresh])).status, "success");
  assert.equal(git("diff", "--cached", "--name-only"), "file.txt");
  assert.equal(read("file.txt"), "edited again\n");
});

test("an operation that does not belong to the scope on screen is refused", async (t) => {
  const { cwd, git, write } = fixture(t);
  write("file.txt", "original\n");
  git("add", "."); git("commit", "-qm", "base");
  write("file.txt", "edited\n");
  const targets = await targetsFor(cwd, { kind: "unstaged" });
  await assert.rejects(applyReviewChange(cwd, "unstage", { kind: "unstaged" }, targets));
  await assert.rejects(applyReviewChange(cwd, "stage", { kind: "staged" }, targets));
  await assert.rejects(applyReviewChange(cwd, "unstage", { kind: "branch", base: "main" }, targets));
  // A hunk of the combined view is not the patch the index would consume.
  await assert.rejects(applyReviewChange(cwd, "stage", { kind: "uncommitted" }, targets.map((target) => ({ ...target, hunkIndex: 0 }))));
  assert.equal(git("diff", "--cached", "--name-only"), "");
});

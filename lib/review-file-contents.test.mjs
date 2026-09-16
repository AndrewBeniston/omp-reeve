import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { readReviewFileSides } from "./review-file-contents.ts";
import { readReviewDiff } from "./review-git.ts";

function fixture(t) {
  const cwd = mkdtempSync(path.join(tmpdir(), "reeve-contents-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
  git("init", "-q", "-b", "main");
  git("config", "user.email", "fixture@example.invalid");
  git("config", "user.name", "Fixture");
  const write = (name, content) => {
    mkdirSync(path.dirname(path.join(cwd, name)), { recursive: true });
    writeFileSync(path.join(cwd, name), content);
  };
  return { cwd, git, write };
}

const LINES = (marker) => `${Array.from({ length: 30 }, (_, index) => `line ${index + 1}${index === 14 ? marker : ""}`).join("\n")}\n`;

async function sides(cwd, scope, filePath) {
  const diff = await readReviewDiff(cwd, scope);
  return readReviewFileSides(cwd, scope, filePath, { revision: diff.fileRevisions[filePath] });
}

test("both sides come back whole for an unstaged change, not just the patch's lines", async (t) => {
  const { cwd, git, write } = fixture(t);
  write("file.txt", LINES("")); git("add", "."); git("commit", "-qm", "base");
  write("file.txt", LINES(" edited"));

  const result = await sides(cwd, { kind: "unstaged" }, "file.txt");
  assert.equal(result.status, "ready");
  assert.equal(result.oldContents.split("\n").length, 31, "the whole committed file");
  assert.equal(result.newContents.split("\n").length, 31, "the whole working file");
  assert.match(result.newContents, /line 15 edited/);
  assert.doesNotMatch(result.oldContents, /edited/);
  assert.equal(result.oldName, "file.txt");
});

test("the staged view compares the index against the commit, and the combined view against the commit", async (t) => {
  const { cwd, git, write } = fixture(t);
  write("file.txt", LINES("")); git("add", "."); git("commit", "-qm", "base");
  write("file.txt", LINES(" staged")); git("add", "file.txt");
  write("file.txt", LINES(" working"));

  const staged = await sides(cwd, { kind: "staged" }, "file.txt");
  assert.match(staged.newContents, /line 15 staged/);
  assert.doesNotMatch(staged.newContents, /working/);

  const uncommitted = await sides(cwd, { kind: "uncommitted" }, "file.txt");
  assert.match(uncommitted.newContents, /line 15 working/);
  assert.doesNotMatch(uncommitted.oldContents, /staged|working/);
});

test("a branch review reads from the common ancestor, and a commit from its parent", async (t) => {
  const { cwd, git, write } = fixture(t);
  write("file.txt", LINES("")); git("add", "."); git("commit", "-qm", "base");
  git("checkout", "-qb", "feature");
  write("file.txt", LINES(" on the branch")); git("commit", "-qam", "branch change");

  const branch = await sides(cwd, { kind: "branch", base: "main" }, "file.txt");
  assert.match(branch.newContents, /line 15 on the branch/);
  assert.doesNotMatch(branch.oldContents, /on the branch/);

  const commit = await sides(cwd, { kind: "commit", revision: "HEAD" }, "file.txt");
  assert.match(commit.newContents, /on the branch/);
  assert.doesNotMatch(commit.oldContents, /on the branch/);
});

test("an added file has no old side, a deleted file has no new side, and a rename keeps both names", async (t) => {
  const { cwd, git, write } = fixture(t);
  write("kept.txt", LINES("")); write("gone.txt", "removed\n");
  git("add", "."); git("commit", "-qm", "base");
  write("added.txt", "brand new\n"); git("add", "added.txt");
  git("rm", "-q", "gone.txt");
  git("mv", "kept.txt", "moved.txt");

  const added = await sides(cwd, { kind: "staged" }, "added.txt");
  assert.equal(added.oldContents, null);
  assert.equal(added.newContents, "brand new\n");

  const deleted = await sides(cwd, { kind: "staged" }, "gone.txt");
  assert.equal(deleted.newContents, null);
  assert.equal(deleted.oldContents, "removed\n");

  // A rename with no content change carries no `index` line, so there is no
  // object to read either side from — and nothing to expand either.
  assert.equal((await sides(cwd, { kind: "staged" }, "moved.txt")).status, "unavailable");
});

test("a rename that also changes the file expands, and keeps both names", async (t) => {
  const { cwd, git, write } = fixture(t);
  write("kept.txt", LINES("")); git("add", "."); git("commit", "-qm", "base");
  git("mv", "kept.txt", "moved.txt");
  write("moved.txt", LINES(" after the move")); git("add", "moved.txt");

  const renamed = await sides(cwd, { kind: "staged" }, "moved.txt");
  assert.equal(renamed.status, "ready");
  assert.equal(renamed.oldName, "kept.txt");
  assert.equal(renamed.newName, "moved.txt");
  assert.match(renamed.newContents, /line 15 after the move/);
  assert.doesNotMatch(renamed.oldContents, /after the move/);
});

test("a file that moved on since the panel read it is refused rather than expanded", async (t) => {
  const { cwd, git, write } = fixture(t);
  write("file.txt", LINES("")); git("add", "."); git("commit", "-qm", "base");
  write("file.txt", LINES(" first"));
  const stale = (await readReviewDiff(cwd, { kind: "unstaged" })).fileRevisions["file.txt"];

  write("file.txt", LINES(" second"));
  assert.equal((await readReviewFileSides(cwd, { kind: "unstaged" }, "file.txt", { revision: stale })).status, "stale");
  assert.equal((await sides(cwd, { kind: "unstaged" }, "file.txt")).status, "ready");
});

test("a path the review does not hold, and a binary file, are both refused", async (t) => {
  const { cwd, git, write } = fixture(t);
  write("file.txt", LINES("")); write("image.bin", Buffer.from([0, 1, 2, 3]));
  git("add", "."); git("commit", "-qm", "base");
  write("image.bin", Buffer.from([0, 9, 9, 9]));
  write("file.txt", LINES(" edited"));

  assert.equal((await readReviewFileSides(cwd, { kind: "unstaged" }, "../outside.txt", { revision: "any" })).status, "not-in-review");
  assert.equal((await readReviewFileSides(cwd, { kind: "unstaged" }, "untouched.txt", { revision: "any" })).status, "not-in-review");
  assert.equal((await sides(cwd, { kind: "unstaged" }, "image.bin")).status, "binary");
});

test("a recorded turn says it cannot be expanded rather than reading some other version", async (t) => {
  const { cwd, git, write } = fixture(t);
  write("file.txt", LINES("")); git("add", "."); git("commit", "-qm", "base");
  write("file.txt", LINES(" edited"));

  const result = await readReviewFileSides(cwd, { kind: "lastTurn", sessionId: "01a0" }, "file.txt", { revision: "any" });
  assert.equal(result.status, "unsupported");
});

test("both working files and index blobs refuse oversized content before loading it", async (t) => {
  const { cwd, git, write } = fixture(t);
  const large = "context line\n".repeat(180_000);
  write("large.txt", large); git("add", "."); git("commit", "-qm", "base");
  write("large.txt", large + "changed\n");
  assert.equal((await sides(cwd, { kind: "unstaged" }, "large.txt")).status, "too-large");
  git("add", ".");
  assert.equal((await sides(cwd, { kind: "staged" }, "large.txt")).status, "too-large");
});

test("a large new working side is bounded even when the old blob is small", async (t) => {
  const { cwd, git, write } = fixture(t);
  write("file.txt", "before\n"); git("add", "."); git("commit", "-qm", "base");
  write("file.txt", "large line\n".repeat(210_000));
  assert.equal((await sides(cwd, { kind: "unstaged" }, "file.txt")).status, "too-large");
});

// Intercept the first object read, after readReviewDiff has validated the patch.
// All replacements and the Git shim live in disposable fixture directories.
async function duringRead(t, action, expected) {
  const { cwd, git, write } = fixture(t);
  write("file.txt", LINES("")); git("add", "."); git("commit", "-qm", "base");
  write("file.txt", LINES(" displayed"));
  const scope = { kind: "unstaged" };
  const diff = await readReviewDiff(cwd, scope);
  const shim = mkdtempSync(path.join(tmpdir(), "reeve-git-shim-"));
  t.after(() => rmSync(shim, { recursive: true, force: true }));
  const realGit = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
  const quote = (value) => "'" + value.replaceAll("'", "'\\''") + "'";
  writeFileSync(path.join(shim, "git"), `#!/bin/sh\ncase "$*" in\n  *'cat-file -s'*)\n    if [ ! -e ${quote(path.join(shim, "done"))} ]; then\n      touch ${quote(path.join(shim, "done"))}\n      ${action(cwd, shim, quote)}\n    fi\n    ;;\nesac\nexec ${quote(realGit)} "$@"\n`, { mode: 0o755 });
  const original = process.env.PATH;
  process.env.PATH = `${shim}:${original}`;
  try {
    const result = await readReviewFileSides(cwd, scope, "file.txt", { revision: diff.fileRevisions["file.txt"] });
    assert.equal(result.status, expected);
    assert.equal("newContents" in result, false);
  } finally { process.env.PATH = original; }
}

test("a working file replaced after revision validation cannot return mismatched content", async (t) => {
  await duringRead(t, (cwd, _, q) => `printf 'unseen replacement\\n' > ${q(path.join(cwd, "file.txt"))}`, "stale");
});

test("a required working side removed during loading is unavailable, never ready with null", async (t) => {
  await duringRead(t, (cwd, _, q) => `rm ${q(path.join(cwd, "file.txt"))}`, "unavailable");
});

test("a symlink substituted after validation cannot read outside the repository", async (t) => {
  await duringRead(t, (cwd, shim, q) => {
    const outside = path.join(shim, "outside.txt");
    writeFileSync(outside, "outside content must not be returned\n");
    return `rm ${q(path.join(cwd, "file.txt"))}\nln -s ${q(outside)} ${q(path.join(cwd, "file.txt"))}`;
  }, "unavailable");
});

test("root commits and untracked additions have only their actual new side", async (t) => {
  const { cwd, git, write } = fixture(t);
  write("first.txt", "first\n"); git("add", "."); git("commit", "-qm", "root");
  const root = await sides(cwd, { kind: "commit", revision: "HEAD" }, "first.txt");
  assert.equal(root.status, "ready"); assert.equal(root.oldContents, null);
  write("new.txt", "untracked\n");
  const untracked = await sides(cwd, { kind: "uncommitted" }, "new.txt");
  assert.equal(untracked.status, "ready"); assert.equal(untracked.oldContents, null);
  assert.equal(untracked.newContents, "untracked\n");
});

test("expansion never invokes a repository clean filter while revalidating", async (t) => {
  const { cwd, git, write } = fixture(t);
  write("file.txt", LINES("")); git("add", "."); git("commit", "-qm", "base");
  write("file.txt", LINES(" edited"));
  const scope = { kind: "unstaged" };
  const diff = await readReviewDiff(cwd, scope);
  write(".gitattributes", "file.txt filter=fixture\n");
  git("config", "filter.fixture.clean", "touch filter-ran; cat");
  git("config", "filter.fixture.required", "true");
  const result = await readReviewFileSides(cwd, scope, "file.txt", { revision: diff.fileRevisions["file.txt"] });
  assert.equal(result.status, "ready");
  const { existsSync } = await import("node:fs");
  assert.equal(existsSync(path.join(cwd, "filter-ran")), false);
});

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { defaultReviewBase, isGitReadableScope, readReviewBranches, readReviewCommits, readReviewDiff, ReviewUnavailableError, reviewUnavailableResponse } from "./review-git.ts";
import { REVIEW_UNTRACKED_FILE_CEILING } from "./review-limits.ts";

function fixture(t) {
  const cwd = mkdtempSync(path.join(tmpdir(), "reeve-review-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    env: { ...process.env, GIT_AUTHOR_NAME: "Test", GIT_AUTHOR_EMAIL: "test@example.invalid", GIT_COMMITTER_NAME: "Test", GIT_COMMITTER_EMAIL: "test@example.invalid" },
  }).trim();
  git("init", "-b", "main");
  const write = (name, content) => writeFileSync(path.join(cwd, name), content);
  return { cwd, git, write };
}

test("staged and unstaged review separate two versions of the same file", async (t) => {
  const { cwd, git, write } = fixture(t);
  write("file.txt", "original\n"); git("add", "."); git("commit", "-qm", "initial");
  write("file.txt", "staged\n"); git("add", ".");
  write("file.txt", "working\n");
  const staged = await readReviewDiff(cwd, { kind: "staged" });
  assert.match(staged.patch, /-original\n\+staged/);
  assert.doesNotMatch(staged.patch, /working/);
  const unstaged = await readReviewDiff(cwd, { kind: "unstaged" });
  assert.match(unstaged.patch, /-staged\n\+working/);
  const combined = await readReviewDiff(cwd, { kind: "uncommitted" });
  assert.match(combined.patch, /-original\n\+working/);
});

test("untracked files stop at the shipped ceiling, and the ones left out are counted", async (t) => {
  const { cwd, git, write } = fixture(t);
  write("file.txt", "original\n"); git("add", "."); git("commit", "-qm", "initial");
  const over = 3;
  for (let index = 0; index < REVIEW_UNTRACKED_FILE_CEILING + over; index++) write(`new-${index}.txt`, "new\n");
  const result = await readReviewDiff(cwd, { kind: "uncommitted" });
  assert.equal(result.untrackedFiles.length, REVIEW_UNTRACKED_FILE_CEILING);
  // Held back, never dropped quietly: the notice is drawn from this count.
  assert.equal(result.omittedUntrackedFiles, over);
});

test("a refused read names the limit it hit and is not offered as retryable", () => {
  const tooLarge = new ReviewUnavailableError("diff-too-large", "These changes are larger than the 32 MiB Review reads at once.");
  const response = reviewUnavailableResponse(tooLarge);
  assert.equal(response.reason, "diff-too-large");
  // 413 rather than 409: the request was understood and the payload is the problem.
  assert.equal(response.status, 413);
  assert.match(response.error, /32 MiB/);
});

test("an unborn repository includes staged and untracked text without requiring HEAD", async (t) => {
  const { cwd, git, write } = fixture(t);
  write("staged.txt", "index content\n"); git("add", ".");
  write("new.txt", "new content\n");
  const result = await readReviewDiff(cwd, { kind: "uncommitted" });
  assert.match(result.patch, /\+index content/);
  assert.match(result.patch, /\+new content/);
  assert.equal(result.omittedUntrackedFiles, 0);
  assert.doesNotMatch((await readReviewDiff(cwd, { kind: "staged" })).patch, /new content/);
});

test("branch review includes working changes while commit review stays fixed", async (t) => {
  const { cwd, git, write } = fixture(t);
  write("file.txt", "initial\n"); git("add", "."); git("commit", "-qm", "initial");
  git("checkout", "-qb", "feature");
  write("file.txt", "committed\n"); git("commit", "-qam", "feature");
  write("file.txt", "unrelated\n");
  write("new.txt", "untracked content\n");
  const branch = await readReviewDiff(cwd, { kind: "branch", base: "main" });
  assert.match(branch.patch, /-initial\n\+unrelated/);
  assert.match(branch.patch, /\+untracked content/);
  const commit = await readReviewDiff(cwd, { kind: "commit", revision: "HEAD" });
  assert.match(commit.patch, /\+committed/);
  assert.doesNotMatch(commit.patch, /unrelated|untracked content/);
  await assert.rejects(readReviewDiff(cwd, { kind: "commit", revision: "--output=unexpected" }));
});

test("review file headers ignore personal Git diff prefix settings", async (t) => {
  const { cwd, git, write } = fixture(t);
  write("file.txt", "original\n"); git("add", "."); git("commit", "-qm", "initial");
  write("file.txt", "updated\n"); git("add", ".");
  git("config", "diff.noprefix", "true");
  git("config", "diff.mnemonicPrefix", "true");
  git("config", "diff.srcPrefix", "custom-before/");
  git("config", "diff.dstPrefix", "custom-after/");
  for (const kind of ["staged", "uncommitted"]) {
    const result = await readReviewDiff(cwd, { kind });
    assert.match(result.patch, /^diff --git a\/file.txt b\/file.txt\n/);
    assert.match(result.patch, /--- a\/file.txt\n\+\+\+ b\/file.txt\n/);
  }
  git("commit", "-qm", "update");
  const result = await readReviewDiff(cwd, { kind: "commit", revision: "HEAD" });
  assert.match(result.patch, /^diff --git a\/file.txt b\/file.txt\n/);
});

test("review choices distinguish local and remote branches and omit symbolic aliases", async (t) => {
  const { cwd, git, write } = fixture(t);
  write("file.txt", "initial\n"); git("add", "."); git("commit", "-qm", "initial");
  git("branch", "feature");
  git("update-ref", "refs/remotes/origin/main", "HEAD");
  git("symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main");
  const branches = await readReviewBranches(cwd);
  assert.deepEqual(branches.map((branch) => branch.ref).sort(), ["refs/heads/feature", "refs/heads/main", "refs/remotes/origin/main"]);
  assert.equal(branches.find((branch) => branch.current)?.name, "main");
  git("checkout", "-qb", "work");
  git("commit", "--allow-empty", "-qm", "branch change");
  const { commits } = await readReviewCommits(cwd, "main");
  assert.deepEqual(commits, [{ sha: git("rev-parse", "HEAD"), subject: "branch change", message: "branch change" }]);
  assert.deepEqual((await readReviewCommits(cwd, "HEAD")).commits, []);
  await assert.rejects(readReviewCommits(cwd, "--output=unexpected"));
  git("remote", "add", "origin", ".");
  assert.equal(await defaultReviewBase(cwd), "refs/remotes/origin/main");
  assert.deepEqual(await readReviewCommits(cwd), { commits });
});

test("review choices handle a repository before its first commit", async (t) => {
  const { cwd } = fixture(t);
  assert.deepEqual(await readReviewBranches(cwd), []);
  assert.deepEqual(await readReviewCommits(cwd), { commits: [] });
});

test("commit choices use the common ancestor when the comparison branch has moved", async (t) => {
  const { cwd, git, write } = fixture(t);
  write("file.txt", "initial\n"); git("add", "."); git("commit", "-qm", "shared history");
  git("checkout", "-qb", "feature");
  git("commit", "--allow-empty", "-qm", "feature change");
  const feature = git("rev-parse", "HEAD");
  git("checkout", "-q", "main");
  git("commit", "--allow-empty", "-qm", "base advanced");
  git("checkout", "-q", "feature");
  assert.deepEqual(await readReviewCommits(cwd, "main"), {
    commits: [{ sha: feature, subject: "feature change", message: "feature change" }],
  });
  // With no remote there is no comparison to draw, so the choices are this
  // branch's own history rather than nothing to choose from.
  const offered = (await readReviewCommits(cwd)).commits;
  assert.deepEqual(offered.map((commit) => commit.subject), ["feature change", "shared history"]);
});

test("a repository with no remote still offers its commits to review", async (t) => {
  const { cwd, git, write } = fixture(t);
  write("file.txt", "initial\n"); git("add", "."); git("commit", "-qm", "first");
  write("file.txt", "second\n"); git("add", "."); git("commit", "-qm", "second");

  assert.equal(await defaultReviewBase(cwd), null);
  const { commits } = await readReviewCommits(cwd);
  assert.deepEqual(commits.map((commit) => commit.subject), ["second", "first"]);
  // The branch picker has the local branches, which is what it compares with.
  git("branch", "feature");
  assert.deepEqual((await readReviewBranches(cwd)).map((branch) => branch.name).sort(), ["feature", "main"]);
});

test("Review viewed revisions change only for files whose diff changes", async (t) => {
  const { cwd, git, write } = fixture(t);
  write("one.txt", "before\n"); write("two.txt", "before\n");
  git("add", "."); git("commit", "-qm", "initial");
  write("one.txt", "first edit\n"); write("two.txt", "unchanged edit\n");
  const first = await readReviewDiff(cwd, { kind: "branch", base: "main" });
  const repeated = await readReviewDiff(cwd, { kind: "branch", base: "main" });
  assert.deepEqual(first.fileRevisions, repeated.fileRevisions);
  write("one.txt", "second edit\n");
  const updated = await readReviewDiff(cwd, { kind: "branch", base: "main" });
  assert.notEqual(updated.fileRevisions["one.txt"], first.fileRevisions["one.txt"]);
  assert.equal(updated.fileRevisions["two.txt"], first.fileRevisions["two.txt"]);
});

test("Review reports unresolved conflicts once and keeps historical commits independent", async (t) => {
  const { cwd, git, write } = fixture(t);
  write("conflict.txt", "base\n"); git("add", "."); git("commit", "-qm", "base");
  git("checkout", "-qb", "other");
  write("conflict.txt", "other side\n"); git("commit", "-qam", "other side");
  git("checkout", "-q", "main");
  write("conflict.txt", "this side\n"); git("commit", "-qam", "this side");
  assert.throws(() => git("merge", "other", "--no-edit"));
  for (const kind of ["unstaged", "staged", "uncommitted"]) {
    assert.deepEqual((await readReviewDiff(cwd, { kind })).conflictedFiles, ["conflict.txt"]);
  }
  assert.deepEqual((await readReviewDiff(cwd, { kind: "commit", revision: "HEAD" })).conflictedFiles, []);
});

test("subfolder Review excludes sibling changes and conflicts", async (t) => {
  const { cwd, git, write } = fixture(t);
  mkdirSync(path.join(cwd, "selected")); mkdirSync(path.join(cwd, "sibling"));
  write("selected/file.txt", "base\n"); write("sibling/file.txt", "base\n");
  git("add", "."); git("commit", "-qm", "base");
  git("checkout", "-qb", "other");
  write("sibling/file.txt", "other side\n"); git("commit", "-qam", "other side");
  git("checkout", "-q", "main");
  write("sibling/file.txt", "this side\n"); git("commit", "-qam", "this side");
  assert.throws(() => git("merge", "other", "--no-edit"));
  write("selected/file.txt", "selected edit\n");
  write("selected/new.txt", "selected new\n");
  write("sibling/new.txt", "sibling new\n");
  const result = await readReviewDiff(path.join(cwd, "selected"), { kind: "uncommitted" });
  assert.deepEqual(result.conflictedFiles, []);
  assert.match(result.patch, /selected edit/);
  assert.match(result.patch, /selected new/);
  assert.doesNotMatch(result.patch, /sibling|this side|other side/);
  assert.deepEqual(Object.keys(result.fileRevisions).sort(), ["selected/file.txt", "selected/new.txt"]);
  // The patch names files from the repository root, so the directory Review
  // was opened for travels with it: the browser needs both to name a file the
  // way the Session in that subfolder resolves it.
  assert.equal(result.repositoryRoot, realpathSync(cwd));
  assert.equal(result.cwd, realpathSync(path.join(cwd, "selected")));
});

test("a directory outside a repository is reported as unreviewable, not as a failed read", async (t) => {
  const outside = mkdtempSync(path.join(tmpdir(), "reeve-review-plain-"));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  for (const read of [
    () => readReviewDiff(outside, { kind: "uncommitted" }),
    () => readReviewBranches(outside),
    () => readReviewCommits(outside),
    () => defaultReviewBase(outside),
  ]) {
    const error = await read().then(() => null, (error) => error);
    assert.ok(error instanceof ReviewUnavailableError, "expected an unreviewable directory");
    assert.equal(error.reason, "not-a-repository");
    assert.deepEqual(reviewUnavailableResponse(error), { error: error.message, reason: "not-a-repository", status: 409 });
    assert.match(error.message, /Git repository/);
  }
  assert.equal(reviewUnavailableResponse(new Error("ordinary failure")), null);
});

test("a broken branch reference is not treated as a repository before its first commit", async (t) => {
  const { cwd, git, write } = fixture(t);
  write("file.txt", "content\n"); git("add", ".");
  writeFileSync(path.join(cwd, ".git/refs/heads/main"), `${"1".repeat(40)}\n`);
  await assert.rejects(readReviewDiff(cwd, { kind: "uncommitted" }));
  await assert.rejects(readReviewCommits(cwd));
});

test("untracked Review retains empty and binary files and reads symlink text instead of its target", async (t) => {
  const { cwd, write } = fixture(t);
  write("empty.txt", "");
  write("binary.bin", Buffer.from([0, 1, 2, 3]));
  const outside = mkdtempSync(path.join(tmpdir(), "reeve-review-outside-"));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  writeFileSync(path.join(outside, "private.txt"), "TARGET_CONTENT_MUST_NOT_BE_READ");
  if (process.platform !== "win32") symlinkSync(path.join(outside, "private.txt"), path.join(cwd, "link.txt"));
  const result = await readReviewDiff(cwd, { kind: "uncommitted" });
  assert.equal(result.omittedUntrackedFiles, 0);
  assert.ok(result.fileRevisions["empty.txt"]);
  assert.ok(result.fileRevisions["binary.bin"]);
  assert.match(result.patch, /Binary files/);
  assert.doesNotMatch(result.patch, /TARGET_CONTENT_MUST_NOT_BE_READ/);
  if (process.platform !== "win32") {
    assert.ok(result.fileRevisions["link.txt"]);
    assert.match(result.patch, /new file mode 120000/);
  }
});

test("Review commit choices preserve multiline messages without splitting them into commits", async (t) => {
  const { cwd, git } = fixture(t);
  git("commit", "--allow-empty", "-qm", "base");
  git("checkout", "-qb", "feature");
  git("commit", "--allow-empty", "-qm", "Subject\n\nFirst paragraph.\nSecond line.\n\nAnother paragraph.");
  const { commits } = await readReviewCommits(cwd, "main");
  assert.equal(commits.length, 1);
  assert.equal(commits[0].subject, "Subject");
  assert.equal(commits[0].message, "Subject\n\nFirst paragraph.\nSecond line.\n\nAnother paragraph.");
});

test("the recorded turn is refused by the Git reader rather than compared against a revision", async (t) => {
  const { cwd, git } = fixture(t);
  git("commit", "--allow-empty", "-qm", "base");
  const lastTurn = { kind: "lastTurn", sessionId: "01a0a1ab-db1a-7295-99e9-83c197d6b3d2" };

  assert.equal(isGitReadableScope(lastTurn), false);
  assert.equal(isGitReadableScope({ kind: "uncommitted" }), true);
  await assert.rejects(readReviewDiff(cwd, lastTurn), /recording/);
});

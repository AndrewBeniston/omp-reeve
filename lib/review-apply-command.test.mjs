import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import { reviewApplyCommand, shellSingleQuote, uniqueHeredocDelimiter } from "./review-apply-command.ts";

const scratch = mkdtempSync(join(tmpdir(), "reeve-apply-command-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

/**
 * A repository whose path and whose content both carry characters a shell
 * would act on. This is the case the quoting exists for.
 */
function hostileRepository(name) {
  const root = join(scratch, name);
  mkdirSync(root, { recursive: true });
  git(root, "init", "-q");
  git(root, "config", "user.email", "reeve@example.invalid");
  git(root, "config", "user.name", "Reeve Test");
  writeFileSync(join(root, "note.txt"), "first\n");
  git(root, "add", "note.txt");
  git(root, "commit", "-qm", "base");
  return root;
}

test("a single quote in the repository path is escaped, not ended", () => {
  assert.equal(shellSingleQuote("/tmp/it's here"), "'/tmp/it'\\''s here'");
  const hostile = "/tmp/it's $(id) `id` here";
  const echoed = execFileSync("sh", ["-c", "printf %s " + shellSingleQuote(hostile)], { encoding: "utf8" });
  assert.equal(echoed, hostile);
});

test("the delimiter grows until no patch line matches it", () => {
  assert.equal(uniqueHeredocDelimiter("+ hello\n"), "REEVE_REVIEW_PATCH");
  assert.equal(uniqueHeredocDelimiter("+REEVE_REVIEW_PATCH\nREEVE_REVIEW_PATCH\n"), "REEVE_REVIEW_PATCH_1");
  assert.equal(uniqueHeredocDelimiter("REEVE_REVIEW_PATCH\nREEVE_REVIEW_PATCH_1\n"), "REEVE_REVIEW_PATCH_2");
});

test("nothing to apply produces no command", () => {
  assert.equal(reviewApplyCommand({ repositoryRoot: "/tmp/repo", patch: "" }), null);
  assert.equal(reviewApplyCommand({ repositoryRoot: "", patch: "diff --git a/a b/a\n" }), null);
});

test("the copied command reproduces the whole review in a second repository", () => {
  const source = hostileRepository("source repo");
  // Content the shell would act on if the heredoc delimiter were unquoted.
  const sentinel = join(scratch, "must-not-exist");
  writeFileSync(join(source, "note.txt"), "first\nsecond $(touch " + sentinel + ")\n");
  writeFileSync(join(source, "added.sh"), "echo `id` \\ ${HOME}\n");
  git(source, "add", "-A", "-N");
  const patch = git(source, "diff");
  assert.ok(patch.includes("added.sh"), "the review covers every changed file, not one");

  const target = hostileRepository("target's repo");
  const command = reviewApplyCommand({ repositoryRoot: target, patch });
  assert.ok(command, "a non-empty review produces a command");
  // Run from somewhere else, to prove the command supplies its own directory.
  execFileSync("sh", ["-c", command], { cwd: scratch, encoding: "utf8" });

  assert.equal(readFileSync(join(target, "note.txt"), "utf8"), "first\nsecond $(touch " + sentinel + ")\n");
  assert.equal(readFileSync(join(target, "added.sh"), "utf8"), "echo `id` \\ ${HOME}\n");
  assert.equal(existsSync(sentinel), false, "the patch text ran nothing");
});

test("the directory change stays inside the command", () => {
  const target = hostileRepository("cwd repo");
  writeFileSync(join(target, "note.txt"), "first\nsecond\n");
  const patch = git(target, "diff");
  git(target, "checkout", "--", "note.txt");
  const command = reviewApplyCommand({ repositoryRoot: target, patch });
  const where = execFileSync("sh", ["-c", command + "\npwd"], { cwd: scratch, encoding: "utf8" }).trim();
  assert.equal(where, execFileSync("sh", ["-c", "pwd"], { cwd: scratch, encoding: "utf8" }).trim());
});

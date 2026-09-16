import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { readBranchInputs } from "./review-commit-git.ts";

/**
 * What a base may be.
 *
 * A base arrives as text from the browser and ends up in a Git range. Git
 * reads a leading dash as an option, so a base of `--output=FILE` would make
 * Git write the diff to FILE. These prove the base is resolved to a commit
 * first, and that an ordinary branch still reads.
 */
function repository() {
  const root = mkdtempSync(path.join(tmpdir(), "reeve-branch-inputs-"));
  const run = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
  run("init", "--quiet", "--initial-branch", "main");
  run("config", "user.email", "test@example.invalid");
  run("config", "user.name", "Test");
  writeFileSync(path.join(root, "one.txt"), "first\n");
  run("add", "one.txt");
  run("commit", "--quiet", "--message", "feat: add one");
  run("checkout", "--quiet", "-b", "work");
  writeFileSync(path.join(root, "two.txt"), "second\n");
  run("add", "two.txt");
  run("commit", "--quiet", "--message", "feat: add two");
  return root;
}

test("a base that is a Git option writes no file and is refused", async () => {
  const root = repository();
  const target = path.join(tmpdir(), `reeve-branch-inputs-attack-${process.pid}`);
  try {
    await assert.rejects(() => readBranchInputs(root, `--output=${target}`));
    assert.equal(existsSync(target), false);
    assert.equal(existsSync(`${target}...HEAD`), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(target, { force: true });
    rmSync(`${target}...HEAD`, { force: true });
  }
});

test("a branch reads against its base", async () => {
  const root = repository();
  try {
    const inputs = await readBranchInputs(root, "main");
    assert.deepEqual(inputs.subjects, ["feat: add two"]);
    assert.match(inputs.diff, /two\.txt/);
    assert.match(inputs.numstat, /two\.txt/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, mkdir, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { createReviewRepository } from "./review-repository-init.ts";

const run = promisify(execFile);

/** A directory of this test's own, removed whatever the test does to it. */
async function fixture(body) {
  const directory = await mkdtemp(path.join(tmpdir(), "reeve-review-init-"));
  try {
    await body(directory);
  } finally {
    await chmod(directory, 0o700).catch(() => {});
    await rm(directory, { recursive: true, force: true });
  }
}

test("a directory with no repository gains one", async () => {
  await fixture(async (directory) => {
    const outcome = await createReviewRepository(directory);
    assert.equal(outcome.status, "created");
    // Git's own answer, not this test's assumption about the path.
    const { stdout } = await run("git", ["rev-parse", "--show-toplevel"], { cwd: directory });
    assert.equal(outcome.repositoryRoot, stdout.trim());
    // Starting a repository stages nothing and commits nothing.
    const { stdout: staged } = await run("git", ["diff", "--cached", "--name-only"], { cwd: directory });
    assert.equal(staged.trim(), "");
  });
});

test("a directory already inside a repository is refused, and left alone", async () => {
  await fixture(async (directory) => {
    await run("git", ["init"], { cwd: directory });
    const { stdout: before } = await run("git", ["rev-parse", "--absolute-git-dir"], { cwd: directory });

    const nested = path.join(directory, "packages", "inner");
    await mkdir(nested, { recursive: true });
    for (const target of [directory, nested]) {
      const outcome = await createReviewRepository(target);
      assert.equal(outcome.status, "refused");
      assert.equal(outcome.reason, "already-a-repository");
    }

    const { stdout: after } = await run("git", ["rev-parse", "--absolute-git-dir"], { cwd: nested });
    assert.equal(after.trim(), before.trim());
  });
});

test("a refusal from Git carries the reason it gave", async () => {
  await fixture(async (directory) => {
    const readOnly = path.join(directory, "locked");
    await mkdir(readOnly);
    await chmod(readOnly, 0o500);
    const outcome = await createReviewRepository(readOnly);
    await chmod(readOnly, 0o700);
    assert.equal(outcome.status, "refused");
    assert.equal(outcome.reason, "failed");
    // The message is Git's, not a generic failure with nothing to act on.
    assert.match(outcome.message, /Git could not start a repository here: ./);
  });
});

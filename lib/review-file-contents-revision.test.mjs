import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { readReviewFileSides } from "./review-file-contents.ts";
import { readReviewDiff } from "./review-git.ts";

/*
 * A file's revision is a hash of one read's patch text, so a repository with a
 * clean filter configured produces one digest when the filter runs and another
 * when it is disabled — and the contents read disables it. A caller pinning
 * the digest it was shown was therefore refused forever in exactly those
 * repositories, which is what these exercise.
 */

function filteredRepository(t) {
  const cwd = mkdtempSync(path.join(tmpdir(), "reeve-revision-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
  git("init", "-q", "-b", "main");
  git("config", "user.email", "fixture@example.invalid");
  git("config", "user.name", "Fixture");
  // A clean filter that rewrites the stored text, so the filtered and
  // unfiltered readings of the same working file genuinely differ.
  git("config", "filter.redact.clean", "sed -e s/secret/REDACTED/");
  writeFileSync(path.join(cwd, ".gitattributes"), "*.txt filter=redact\n");
  writeFileSync(path.join(cwd, "file.txt"), "one\ntwo\n");
  git("add", ".");
  git("commit", "-qm", "base");
  writeFileSync(path.join(cwd, "file.txt"), "one\ntwo secret\n");
  return cwd;
}

test("a revision taken from the displayed diff is refused, and the refusal says what the file is at", async (t) => {
  const cwd = filteredRepository(t);
  const scope = { kind: "unstaged" };
  const displayed = (await readReviewDiff(cwd, scope)).fileRevisions["file.txt"];
  const canonical = (await readReviewDiff(cwd, scope, { disableFilters: true })).fileRevisions["file.txt"];
  assert.notEqual(displayed, canonical, "the fixture must actually produce two digests");

  const refused = await readReviewFileSides(cwd, scope, "file.txt", { revision: displayed });
  assert.equal(refused.status, "stale");
  // Without this the caller has nothing to act on and retries forever.
  assert.equal(refused.revision, canonical);

  const pinned = await readReviewFileSides(cwd, scope, "file.txt", { revision: canonical });
  assert.equal(pinned.status, "ready");
  assert.equal(pinned.revision, canonical);
});

test("asking for the current version reads the file and says which revision it read", async (t) => {
  const cwd = filteredRepository(t);
  const scope = { kind: "unstaged" };
  const canonical = (await readReviewDiff(cwd, scope, { disableFilters: true })).fileRevisions["file.txt"];

  const current = await readReviewFileSides(cwd, scope, "file.txt", { current: true });
  assert.equal(current.status, "ready");
  // Content and revision come from one read, so a reader that displays this
  // content is never describing it by a revision it does not have.
  assert.equal(current.revision, canonical);
  assert.match(current.newContents, /two secret/);
  assert.equal(current.oldContents, "one\ntwo\n");

  // Asking for the current version is not permission to ignore movement: a
  // file that changes while it is being read is still refused.
  writeFileSync(path.join(cwd, "file.txt"), "one\ntwo secret again\n");
  const moved = await readReviewFileSides(cwd, scope, "file.txt", { revision: canonical });
  assert.equal(moved.status, "stale");
  assert.notEqual(moved.revision, canonical);
});

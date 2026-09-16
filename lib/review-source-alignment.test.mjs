import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { alignLines, changedLines, diffRegions } from "./line-diff.ts";
import { readReviewFileSides } from "./review-file-contents.ts";

/*
 * A review's changed lines are numbered against the version it compared, and
 * the source view draws the working copy. For a staged review those are two
 * different files, so the numbers have to be carried across before they mean
 * anything on screen.
 */

test("a staged change stays on its own text after the working copy shifts it down", async (t) => {
  const cwd = mkdtempSync(path.join(tmpdir(), "reeve-align-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
  git("init", "-q", "-b", "main");
  git("config", "user.email", "fixture@example.invalid");
  git("config", "user.name", "Fixture");

  const file = path.join(cwd, "file.txt");
  const original = Array.from({ length: 20 }, (_, index) => `line ${index + 1}`);
  writeFileSync(file, `${original.join("\n")}\n`);
  git("add", ".");
  git("commit", "-qm", "base");

  // Staged: one line changed, and that is what the review compares.
  const staged = [...original];
  staged[14] = "line 15 staged";
  writeFileSync(file, `${staged.join("\n")}\n`);
  git("add", "file.txt");

  // Unstaged, and only in the working copy: ten lines above the change, which
  // move it from line 15 to line 25 on screen.
  const working = [...Array.from({ length: 10 }, (_, index) => `inserted ${index + 1}`), ...staged];
  writeFileSync(file, `${working.join("\n")}\n`);

  const sides = await readReviewFileSides(cwd, { kind: "staged" }, "file.txt", { current: true });
  assert.equal(sides.status, "ready");
  const regions = diffRegions(sides.oldContents.split("\n"), sides.newContents.split("\n"));
  assert.deepEqual(changedLines(regions), [15], "the review numbers its change against the index");

  const displayed = readFileSync(file, "utf8").split("\n");
  // The counterfactual: marking the review's own number would land here.
  assert.equal(displayed[14], "line 5", "line 15 of the working copy is not the changed line");

  const alignment = alignLines(sides.newContents.split("\n"), displayed);
  assert.notEqual(alignment, null);
  const marked = alignment.get(15 - 1) + 1;
  assert.equal(marked, 25);
  assert.equal(displayed[marked - 1], "line 15 staged", "the mark sits on the text the review changed");
});

test("a line the working copy no longer holds is dropped rather than placed approximately", () => {
  const compared = ["alpha", "beta changed", "gamma"];
  const displayed = ["alpha", "beta rewritten by hand", "gamma"];
  const alignment = alignLines(compared, displayed);
  assert.notEqual(alignment, null);
  // Line 2 was changed by the review and then changed again on disk; there is
  // no honest place to mark it, so it has none.
  assert.equal(alignment.get(1), undefined);
  assert.equal(alignment.get(0), 0);
  assert.equal(alignment.get(2), 2);
});

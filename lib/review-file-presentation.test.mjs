import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parsePatchFiles } from "@pierre/diffs";
import { describeReviewFileChange } from "./review-file-presentation.ts";
import { readReviewDiff } from "./review-git.ts";
import { reviewFilesFromPatch } from "./review-files.ts";

/** One repository holding every change this ticket has to present distinctly. */
function mixedFixture(t) {
  const cwd = mkdtempSync(path.join(tmpdir(), "reeve-present-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", ["-C", cwd, ...args], { stdio: "pipe" });
  const write = (name, body) => writeFileSync(path.join(cwd, name), body);
  git("init", "-qb", "main");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.invalid");
  git("config", "core.fileMode", "true");
  write("edited.txt", "one\ntwo\nthree\n");
  write("removed.txt", "gone\n");
  write("moved.txt", "unchanged through the move\n");
  write("moved-and-edited.txt", Array.from({ length: 12 }, (_, n) => `line ${n + 1}\n`).join(""));
  write("run.sh", "echo hello\n");
  write("spaced.txt", "value = 1\n");
  git("add", ".");
  git("commit", "-qm", "base");

  write("edited.txt", "one\ntwo changed\nthree\n");
  rmSync(path.join(cwd, "removed.txt"));
  write("added.txt", "brand new\n");
  git("mv", "moved.txt", "renamed.txt");
  git("mv", "moved-and-edited.txt", "renamed-and-edited.txt");
  write("renamed-and-edited.txt", Array.from({ length: 12 }, (_, n) => `line ${n === 4 ? "five, revised" : n + 1}\n`).join(""));
  chmodSync(path.join(cwd, "run.sh"), 0o755);
  write("spaced.txt", "value   =   1\n");
  git("add", "-A");
  return cwd;
}

/** The panel's own changed files, by path, exactly as the file list holds them. */
async function filesByName(cwd, readOptions) {
  const diff = await readReviewDiff(cwd, { kind: "uncommitted" }, readOptions);
  return new Map(reviewFilesFromPatch(diff.patch, []).map((file) => [file.path, file]));
}

/** The same diff as the renderer parses it, for the two presentations' measurements. */
async function renderedByName(cwd) {
  const diff = await readReviewDiff(cwd, { kind: "uncommitted" });
  const files = parsePatchFiles(diff.patch, undefined, true).flatMap((entry) => entry.files);
  return new Map(files.map((file) => [file.name, file]));
}

test("a mixed-change fixture names what happened to each file", async (t) => {
  const files = await filesByName(mixedFixture(t));
  const notes = (name) => describeReviewFileChange(files.get(name));

  assert.deepEqual(notes("added.txt"), ["New file."]);
  assert.deepEqual(notes("removed.txt"), ["File deleted."]);
  assert.deepEqual(notes("edited.txt"), []);
  assert.deepEqual(notes("renamed.txt"), ["Renamed from moved.txt, with no change to its contents."]);
  assert.deepEqual(notes("renamed-and-edited.txt"), ["Renamed from moved-and-edited.txt."]);
  assert.deepEqual(notes("run.sh"), ["Mode changed from a regular file (100644) to an executable file (100755)."]);
});

test("every file in that fixture is measured for both presentations", async (t) => {
  const cwd = mixedFixture(t);
  const rendered = await renderedByName(cwd);
  const files = await filesByName(cwd);
  /*
   * A pure rename and a mode-only change have no changed lines to draw, in
   * either presentation. Without a caption both render as an empty pane, which
   * is the whole reason one is written above the diff.
   */
  const captionOnly = new Set(["renamed.txt", "run.sh"]);
  for (const [name, file] of rendered) {
    assert.equal(typeof file.splitLineCount, "number", `${name} has no split measurement`);
    assert.equal(typeof file.unifiedLineCount, "number", `${name} has no unified measurement`);
    if (captionOnly.has(name)) {
      assert.equal(file.splitLineCount, 0, `${name} was expected to draw nothing`);
      assert.equal(file.unifiedLineCount, 0, `${name} was expected to draw nothing`);
      assert.equal(describeReviewFileChange(files.get(name)).length, 1, `${name} would render as an empty pane`);
      continue;
    }
    assert.ok(file.splitLineCount > 0, `${name} renders nothing when split`);
    assert.ok(file.unifiedLineCount > 0, `${name} renders nothing when unified`);
  }
});

test("hiding whitespace is a separate reading, and it keeps real work", async (t) => {
  const cwd = mixedFixture(t);
  const exact = await filesByName(cwd);
  const ignoring = await filesByName(cwd, { ignoreWhitespace: true });

  assert.ok(exact.has("spaced.txt"), "the exact reading shows a whitespace-only change");
  assert.equal(ignoring.has("spaced.txt"), false, "the whitespace-ignoring reading drops it");
  for (const name of ["edited.txt", "added.txt", "removed.txt", "renamed.txt", "run.sh"]) {
    assert.ok(ignoring.has(name), `${name} survives the whitespace-ignoring reading`);
  }
});

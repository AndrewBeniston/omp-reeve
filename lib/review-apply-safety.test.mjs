import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { applyReviewChange, readReviewDiff } from "./review-git.ts";

/*
 * The operations that can destroy work nobody was looking at.
 *
 * Every case here starts from a file whose three versions differ — one in the
 * last commit, another in the index, a third in the working tree — because
 * that is where a revert can quietly take the wrong one away.
 */
function fixture(t) {
  const cwd = mkdtempSync(path.join(tmpdir(), "reeve-safety-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    env: { ...process.env, GIT_AUTHOR_NAME: "Test", GIT_AUTHOR_EMAIL: "test@example.invalid", GIT_COMMITTER_NAME: "Test", GIT_COMMITTER_EMAIL: "test@example.invalid" },
  }).trim();
  git("init", "-b", "main");
  return {
    cwd,
    git,
    write: (name, content) => writeFileSync(path.join(cwd, name), content),
    bytes: (name) => [...readFileSync(path.join(cwd, name))],
    /** The blob the index holds for a path, named rather than read. */
    indexBlob: (name) => git("rev-parse", `:${name}`),
  };
}

async function targetFor(cwd, scope, filePath) {
  const diff = await readReviewDiff(cwd, scope);
  return { path: filePath, revision: diff.fileRevisions[filePath] };
}

// A NUL byte is what makes Git call a file binary. Without one these would be
// ordinary text and would take the patch path instead.
const AAAA = Buffer.from([0, 0xaa, 0xaa, 0xaa]);
const BBBB = Buffer.from([0, 0xbb, 0xbb, 0xbb]);
const CCCC = Buffer.from([0, 0xcc, 0xcc, 0xcc]);

for (const kind of ["staged", "uncommitted"]) {
  test(`a binary revert from the ${kind} view refuses while the working tree holds something else`, async (t) => {
    const { cwd, git, write, bytes, indexBlob } = fixture(t);
    write("image.bin", AAAA); git("add", "."); git("commit", "-qm", "base");
    write("image.bin", BBBB); git("add", ".");
    write("image.bin", CCCC);
    const stagedBlob = indexBlob("image.bin");

    const target = await targetFor(cwd, { kind }, "image.bin");
    const result = await applyReviewChange(cwd, "revert", { kind }, [target]);

    assert.equal(result.status, "error");
    assert.deepEqual(result.applied, []);
    assert.equal(result.failed[0].path, "image.bin");
    // Both versions survive the refusal: the index keeps its blob and the
    // working tree keeps the bytes that were never on screen.
    assert.equal(indexBlob("image.bin"), stagedBlob);
    assert.deepEqual(bytes("image.bin"), [...CCCC]);
  });
}

test("a binary revert runs once the index and the working tree agree", async (t) => {
  const { cwd, git, write, bytes } = fixture(t);
  write("image.bin", AAAA); git("add", "."); git("commit", "-qm", "base");
  write("image.bin", BBBB); git("add", ".");

  const target = await targetFor(cwd, { kind: "staged" }, "image.bin");
  assert.equal((await applyReviewChange(cwd, "revert", { kind: "staged" }, [target])).status, "success");
  assert.equal(git("diff", "--cached", "--name-only"), "");
  assert.deepEqual(bytes("image.bin"), [...AAAA]);
});

test("a binary revert of a working-tree change still restores the staged bytes", async (t) => {
  const { cwd, git, write, bytes } = fixture(t);
  write("image.bin", AAAA); git("add", "."); git("commit", "-qm", "base");
  write("image.bin", BBBB); git("add", ".");
  write("image.bin", CCCC);

  // The unstaged view shows index against working tree, so reverting there
  // takes the working tree back to the staged bytes and leaves the index be.
  const target = await targetFor(cwd, { kind: "unstaged" }, "image.bin");
  assert.equal((await applyReviewChange(cwd, "revert", { kind: "unstaged" }, [target])).status, "success");
  assert.deepEqual(bytes("image.bin"), [...BBBB]);
  assert.match(git("diff", "--cached", "--name-only"), /image\.bin/);
});

for (const kind of ["uncommitted", "unstaged"]) {
  test(`an untracked text file reverts away from the ${kind} view`, async (t) => {
    const { cwd, git, write } = fixture(t);
    write("tracked.txt", "base\n"); git("add", "."); git("commit", "-qm", "base");
    write("new.txt", "brand new\n");
    write("tracked.txt", "edited\n");

    const target = await targetFor(cwd, { kind }, "new.txt");
    const result = await applyReviewChange(cwd, "revert", { kind }, [target]);

    assert.equal(result.status, "success");
    assert.deepEqual(result.applied, ["new.txt"]);
    assert.equal(existsSync(path.join(cwd, "new.txt")), false);
    // The unrelated edit beside it is untouched.
    assert.equal(readFileSync(path.join(cwd, "tracked.txt"), "utf8"), "edited\n");
  });
}

test("a staged new text file reverts out of the index and the working tree", async (t) => {
  const { cwd, git, write } = fixture(t);
  write("tracked.txt", "base\n"); git("add", "."); git("commit", "-qm", "base");
  write("new.txt", "brand new\n"); git("add", ".");

  const target = await targetFor(cwd, { kind: "staged" }, "new.txt");
  assert.equal((await applyReviewChange(cwd, "revert", { kind: "staged" }, [target])).status, "success");
  assert.equal(git("diff", "--cached", "--name-only"), "");
  assert.equal(existsSync(path.join(cwd, "new.txt")), false);
});

test("an untracked binary file reverts away, because the whole of it is the change", async (t) => {
  const { cwd, git, write } = fixture(t);
  write("tracked.txt", "base\n"); git("add", "."); git("commit", "-qm", "base");
  write("new.bin", BBBB);

  const target = await targetFor(cwd, { kind: "uncommitted" }, "new.bin");
  assert.equal((await applyReviewChange(cwd, "revert", { kind: "uncommitted" }, [target])).status, "success");
  assert.equal(existsSync(path.join(cwd, "new.bin")), false);
  assert.equal(git("status", "--porcelain"), "");
});

for (const kind of ["staged", "uncommitted"]) {
  test(`a staged new binary file reverts out of the index and off disk from the ${kind} view`, async (t) => {
    const { cwd, git, write } = fixture(t);
    write("tracked.txt", "base\n"); git("add", "."); git("commit", "-qm", "base");
    write("new.bin", BBBB); git("add", ".");

    // The whole file is the change on screen, and HEAD has no version to put
    // back, so reverting the addition removes it from both places at once.
    const target = await targetFor(cwd, { kind }, "new.bin");
    const result = await applyReviewChange(cwd, "revert", { kind }, [target]);
    assert.deepEqual(result, { status: "success", applied: ["new.bin"], skipped: [], failed: [], stale: [] });
    assert.equal(existsSync(path.join(cwd, "new.bin")), false);
    assert.equal(git("status", "--porcelain"), "");
  });
}

test("a staged new binary file refuses while the working tree holds different bytes", async (t) => {
  const { cwd, git, write, bytes, indexBlob } = fixture(t);
  write("tracked.txt", "base\n"); git("add", "."); git("commit", "-qm", "base");
  write("new.bin", BBBB); git("add", ".");
  write("new.bin", CCCC);
  const stagedBlob = indexBlob("new.bin");

  const target = await targetFor(cwd, { kind: "staged" }, "new.bin");
  const result = await applyReviewChange(cwd, "revert", { kind: "staged" }, [target]);
  assert.equal(result.status, "error");
  assert.equal(result.failed[0].path, "new.bin");
  assert.match(result.failed[0].message, /working-tree changes/);
  assert.equal(indexBlob("new.bin"), stagedBlob);
  assert.deepEqual(bytes("new.bin"), [...CCCC]);
});

test("a staged binary file reverts before the repository has any commit", async (t) => {
  const { cwd, git, write } = fixture(t);
  write("new.bin", BBBB); git("add", ".");

  const target = await targetFor(cwd, { kind: "staged" }, "new.bin");
  assert.equal((await applyReviewChange(cwd, "revert", { kind: "staged" }, [target])).status, "success");
  assert.equal(existsSync(path.join(cwd, "new.bin")), false);
  assert.equal(git("status", "--porcelain"), "");
});

test("two hunks of one file are reported as one file, whatever happens to each", async (t) => {
  const { cwd, git, write } = fixture(t);
  const lines = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
  write("file.txt", `${lines.join("\n")}\n`);
  git("add", "."); git("commit", "-qm", "base");
  const edited = [...lines];
  edited[0] = "one edited";
  edited[11] = "twelve edited";
  write("file.txt", `${edited.join("\n")}\n`);

  const { revision } = await targetFor(cwd, { kind: "unstaged" }, "file.txt");
  const both = await applyReviewChange(cwd, "stage", { kind: "unstaged" }, [
    { path: "file.txt", revision, hunkIndex: 0 },
    { path: "file.txt", revision, hunkIndex: 1 },
  ]);
  assert.deepEqual(both, { status: "success", applied: ["file.txt"], skipped: [], failed: [], stale: [] });
  assert.match(git("diff", "--cached"), /\+one edited/);
  assert.match(git("diff", "--cached"), /\+twelve edited/);
});

test("a file whose hunks did not all move is named once in each outcome it earned", async (t) => {
  const { cwd, git, write } = fixture(t);
  write("file.txt", "one\ntwo\nthree\n");
  git("add", "."); git("commit", "-qm", "base");
  write("file.txt", "one edited\ntwo\nthree\n");

  const { revision } = await targetFor(cwd, { kind: "unstaged" }, "file.txt");
  const result = await applyReviewChange(cwd, "stage", { kind: "unstaged" }, [
    { path: "file.txt", revision, hunkIndex: 0 },
    { path: "file.txt", revision, hunkIndex: 7 },
  ]);
  assert.equal(result.status, "partial");
  assert.deepEqual(result.applied, ["file.txt"]);
  assert.equal(result.skipped.length, 1);
  assert.equal(result.skipped[0].path, "file.txt");
  assert.match(git("diff", "--cached"), /\+one edited/);
});

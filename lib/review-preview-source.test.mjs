import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { readReviewDiff } from "./review-git.ts";
import { REVIEW_OBJECT_READ_CAP } from "./review-limits.ts";
import { readReviewPreviewSides } from "./review-preview-source.ts";

/** A 1x1 PNG, so the fixture holds real image bytes rather than text called one. */
const PNG_ONE = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
/** A second 1x1 PNG with different pixel bytes, so the two sides differ. */
const PNG_TWO = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

/**
 * One repository holding an image, a binary, a conflict and a lockfile: the
 * four kinds of file this ticket has to present without a diff.
 */
function fixture(t) {
  const cwd = mkdtempSync(path.join(tmpdir(), "reeve-preview-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: "pipe" }).trim();
  const write = (name, body) => writeFileSync(path.join(cwd, name), body);
  git("init", "-q", "-b", "main");
  git("config", "user.email", "fixture@example.invalid");
  git("config", "user.name", "Fixture");
  write(".gitattributes", "*.lock linguist-generated=true\n");
  write("art/../logo.png", PNG_ONE);
  write("gone.png", PNG_ONE);
  write("blob.bin", Buffer.from([0, 1, 2, 3, 0, 255, 254]));
  write("deps.lock", "resolved = 1\n");
  write("conflict.txt", "base\n");
  git("add", "-A"); git("commit", "-qm", "base");
  return { cwd, git, write };
}

const sides = (cwd, filePath, revision) =>
  readReviewPreviewSides(cwd, { kind: "uncommitted" }, filePath, { revision });

async function revisionOf(cwd, filePath) {
  const diff = await readReviewDiff(cwd, { kind: "uncommitted" });
  return diff.fileRevisions[filePath];
}

test("a changed image comes back as both of its sides, ready to draw", async (t) => {
  const { cwd, write } = fixture(t);
  write("logo.png", PNG_TWO);

  const result = await sides(cwd, "logo.png", await revisionOf(cwd, "logo.png"));
  assert.equal(result.status, "ready");
  assert.equal(result.old.mediaType, "image/png");
  assert.equal(result.new.mediaType, "image/png");
  assert.equal(result.old.base64, PNG_ONE.toString("base64"));
  assert.equal(result.new.base64, PNG_TWO.toString("base64"));
  assert.equal(result.new.bytes, PNG_TWO.length);
});

test("an added image has no old side and a deleted one has no new side", async (t) => {
  const { cwd, write } = fixture(t);
  write("added.png", PNG_TWO);
  rmSync(path.join(cwd, "gone.png"));

  const added = await sides(cwd, "added.png", await revisionOf(cwd, "added.png"));
  assert.equal(added.status, "ready");
  assert.equal(added.old, null);
  assert.equal(added.new.base64, PNG_TWO.toString("base64"));

  const deleted = await sides(cwd, "gone.png", await revisionOf(cwd, "gone.png"));
  assert.equal(deleted.status, "ready");
  assert.equal(deleted.new, null);
  assert.equal(deleted.old.base64, PNG_ONE.toString("base64"));
});

test("a binary, a lockfile and a conflicted file are all refused rather than drawn blank", async (t) => {
  const { cwd, git, write } = fixture(t);
  git("checkout", "-qb", "other");
  write("conflict.txt", "theirs\n");
  git("commit", "-qam", "other side");
  git("checkout", "-q", "main");
  write("conflict.txt", "ours\n");
  git("commit", "-qam", "our side");
  assert.throws(() => git("merge", "other"));
  write("blob.bin", Buffer.from([9, 9, 0, 9]));
  write("deps.lock", "resolved = 2\n");

  // None of the three previews, and each says so rather than returning
  // content a viewer would render as an empty pane.
  for (const filePath of ["blob.bin", "deps.lock", "conflict.txt"]) {
    const result = await readReviewPreviewSides(cwd, { kind: "uncommitted" }, filePath, { current: true });
    assert.equal(result.status, "unsupported", filePath);
  }
});

test("a file the review does not hold, and one that moved since, are both refused", async (t) => {
  const { cwd, write } = fixture(t);
  write("logo.png", PNG_TWO);

  assert.equal((await sides(cwd, "absent.png", "x")).status, "not-in-review");
  const stale = await sides(cwd, "logo.png", "a".repeat(64));
  assert.equal(stale.status, "stale");
  // The refusal names what the file is at, so a panel holding an old digest
  // can move rather than retry against a number it can never produce.
  assert.equal(stale.revision, await revisionOf(cwd, "logo.png"));
});

test("an image replaced by a symlink is refused rather than read through the link", async (t) => {
  const { cwd } = fixture(t);
  const outside = mkdtempSync(path.join(tmpdir(), "reeve-outside-"));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  writeFileSync(path.join(outside, "secret.png"), PNG_TWO);
  rmSync(path.join(cwd, "logo.png"));
  symlinkSync(path.join(outside, "secret.png"), path.join(cwd, "logo.png"));

  // Git writes this as a deletion and a new symlink under one name. Reading
  // the deletion alone would report the image as simply gone.
  const result = await readReviewPreviewSides(cwd, { kind: "uncommitted" }, "logo.png", { current: true });
  assert.equal(result.status, "unsupported");
});

test("a symlinked directory in the path never yields the bytes it points at", async (t) => {
  const { cwd, git, write } = fixture(t);
  execFileSync("mkdir", ["-p", path.join(cwd, "folder")]);
  write("folder/image.png", PNG_ONE);
  git("add", "-A"); git("commit", "-qm", "add folder");

  // The folder itself becomes a link out of the repository. The path still
  // reads as repository-relative, and O_NOFOLLOW on the final component would
  // not notice.
  const outside = mkdtempSync(path.join(tmpdir(), "reeve-outside-"));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  writeFileSync(path.join(outside, "image.png"), PNG_TWO);
  rmSync(path.join(cwd, "folder"), { recursive: true, force: true });
  symlinkSync(outside, path.join(cwd, "folder"));

  const result = await readReviewPreviewSides(cwd, { kind: "uncommitted" }, "folder/image.png", { current: true });
  // Both fixtures are 1x1 PNGs and share a header, so the comparison is
  // against the whole of the outside file rather than a prefix of it.
  assert.ok(!JSON.stringify(result).includes(PNG_TWO.toString("base64")), "outside bytes must never be served");
  // The committed side may still come from the object database; what must
  // never arrive is the file the link points at.
  if (result.status === "ready") assert.equal(result.new, null);
});

test("the preview cap is the reference's own object read cap", () => {
  assert.equal(REVIEW_OBJECT_READ_CAP, 5 * 1024 * 1024);
});

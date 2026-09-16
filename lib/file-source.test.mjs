import assert from "node:assert/strict";
import test from "node:test";
import { chmodSync, linkSync, mkdtempSync, readdirSync, readFileSync, statSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FILE_SOURCE_EDITABLE_LIMIT, FILE_SOURCE_READ_LIMIT } from "./file-source-limits.ts";
import { readFileSource, saveFileSource } from "./file-source.ts";

/*
 * Writing is the destructive half of the source view, so these exercise the
 * guard rather than the happy path: a save must never land on a file that
 * moved under it, and the caller must get the disk's own text back when it
 * did. Every fixture is a throwaway directory.
 */

function fixture() {
  return mkdtempSync(join(tmpdir(), "reeve-file-source-"));
}

test("the size ceilings decide whether a file opens, and whether it opens editable", async () => {
  const directory = fixture();
  const editable = join(directory, "editable.txt");
  writeFileSync(editable, "a".repeat(1024));
  const small = await readFileSource(editable);
  assert.equal(small.status, "ready");
  assert.equal(small.readOnly, false);

  const readOnly = join(directory, "read-only.txt");
  writeFileSync(readOnly, "a".repeat(FILE_SOURCE_EDITABLE_LIMIT + 1));
  const large = await readFileSource(readOnly);
  assert.equal(large.status, "ready");
  assert.equal(large.readOnly, true);

  const refused = join(directory, "refused.txt");
  writeFileSync(refused, "a".repeat(FILE_SOURCE_READ_LIMIT + 1));
  const huge = await readFileSource(refused);
  assert.equal(huge.status, "too-large");
  assert.equal(huge.limitBytes, FILE_SOURCE_READ_LIMIT);
});

test("whether a file is text is a sniff of its first bytes, not its name", async () => {
  const directory = fixture();
  const late = join(directory, "late.ts");
  // A NUL past the sampled window is not what the reference looks at, and a
  // file that is text where it counts opens as text.
  writeFileSync(late, Buffer.concat([Buffer.from("x".repeat(8192)), Buffer.from([0]), Buffer.from("x")]));
  assert.equal((await readFileSource(late)).status, "ready");

  const early = join(directory, "early.ts");
  writeFileSync(early, Buffer.concat([Buffer.from("PK"), Buffer.from([0, 3, 4]), Buffer.from("rest")]));
  assert.equal((await readFileSource(early)).status, "binary");
});

test("a save lands only on the version it was given, and a stale one is a conflict", async () => {
  const directory = fixture();
  const file = join(directory, "notes.md");
  writeFileSync(file, "first\n");
  const opened = await readFileSource(file);
  assert.equal(opened.status, "ready");

  const saved = await saveFileSource(file, "second\n", opened.mtimeMs);
  assert.equal(saved.outcome, "saved");
  assert.equal(readFileSync(file, "utf8"), "second\n");

  // Somebody else writes the file, and the editor still holds the old time.
  writeFileSync(file, "theirs\n");
  utimesSync(file, new Date(), new Date(saved.mtimeMs + 5000));
  const conflicted = await saveFileSource(file, "mine\n", opened.mtimeMs);
  assert.equal(conflicted.outcome, "conflict");
  assert.equal(conflicted.disk.status, "ready");
  assert.equal(conflicted.disk.content, "theirs\n");
  // The refusal is the point: their text is still on disk.
  assert.equal(readFileSync(file, "utf8"), "theirs\n");

  const resolved = await saveFileSource(file, "ours\n", conflicted.disk.mtimeMs);
  assert.equal(resolved.outcome, "saved");
  assert.equal(readFileSync(file, "utf8"), "ours\n");
});

test("a save refuses a symlink and a file past the editable ceiling", async () => {
  const directory = fixture();
  const real = join(directory, "real.txt");
  writeFileSync(real, "real\n");
  const link = join(directory, "link.txt");
  symlinkSync(real, link);
  assert.equal((await saveFileSource(link, "through the link\n", 0)).outcome, "unavailable");
  assert.equal(readFileSync(real, "utf8"), "real\n");

  const big = join(directory, "big.txt");
  writeFileSync(big, "a".repeat(FILE_SOURCE_EDITABLE_LIMIT + 1));
  const opened = await readFileSource(big);
  assert.equal((await saveFileSource(big, "small\n", opened.mtimeMs)).outcome, "unavailable");
  assert.equal(readFileSync(big, "utf8").length, FILE_SOURCE_EDITABLE_LIMIT + 1);

  assert.equal((await saveFileSource(real, "a".repeat(FILE_SOURCE_EDITABLE_LIMIT + 1), 0)).outcome, "too-large");
  assert.equal(readFileSync(real, "utf8"), "real\n");
});

test("a large save lands whole, and a shorter one leaves nothing of the longer text behind", async () => {
  const directory = fixture();
  const file = join(directory, "big.txt");
  writeFileSync(file, "seed\n");
  const opened = await readFileSource(file);

  // Past the size a single write is guaranteed to satisfy, which is what the
  // write loop exists for: a short write used to be reported as a save.
  const long = `${"line of text\n".repeat(400000)}end\n`;
  const saved = await saveFileSource(file, long, opened.mtimeMs);
  assert.equal(saved.outcome, "saved");
  assert.equal(saved.sizeBytes, Buffer.byteLength(long));
  assert.equal(readFileSync(file, "utf8"), long);

  const shorter = await saveFileSource(file, "short\n", saved.mtimeMs);
  assert.equal(shorter.outcome, "saved");
  assert.equal(readFileSync(file, "utf8"), "short\n");
});

test("a read never reports more bytes than it returns", async () => {
  const directory = fixture();
  const file = join(directory, "measured.txt");
  const content = "x".repeat(3 * 1024 * 1024);
  writeFileSync(file, content);
  const read = await readFileSource(file);
  assert.equal(read.status, "ready");
  // The time returned belongs to these bytes, and a save is checked against
  // it: content shorter than the size it claims would be overwritten silently.
  assert.equal(read.sizeBytes, Buffer.byteLength(read.content));
  assert.equal(read.content, content);
});

test("an ordinary save replaces the file and keeps its permissions, leaving nothing behind", async () => {
  const directory = fixture();
  const file = join(directory, "kept.txt");
  writeFileSync(file, "before\n");
  chmodSync(file, 0o640);
  const opened = await readFileSource(file);

  const saved = await saveFileSource(file, "after\n", opened.mtimeMs);
  assert.equal(saved.outcome, "saved");
  assert.equal(readFileSync(file, "utf8"), "after\n");
  assert.equal(statSync(file).mode & 0o777, 0o640, "the file's own permissions, not the writer's default");
  // A replace that leaves its working file behind is a replace that litters
  // somebody's repository with hidden files.
  assert.deepEqual(readdirSync(directory).filter((entry) => entry.endsWith(".tmp")), []);
});

test("a save that cannot be written leaves the original exactly as it was", async (t) => {
  if (typeof process.getuid === "function" && process.getuid() === 0) return;
  const directory = fixture();
  const file = join(directory, "precious.txt");
  writeFileSync(file, "the original\n");
  const opened = await readFileSource(file);

  // The failure injection: the new text is written beside the file, so a
  // directory that refuses new files is a write that fails part-way through
  // exactly where it matters.
  chmodSync(directory, 0o500);
  t.after(() => chmodSync(directory, 0o700));
  const failed = await saveFileSource(file, "replacement\n", opened.mtimeMs);
  assert.equal(failed.outcome, "unavailable");
  // The whole point: the original bytes are still there to be read back.
  assert.equal(readFileSync(file, "utf8"), "the original\n");
  assert.deepEqual(readdirSync(directory).filter((entry) => entry.endsWith(".tmp")), []);
});

test("a hard-linked file is written in place, so every link sees the new text", async () => {
  const directory = fixture();
  const file = join(directory, "linked.txt");
  const other = join(directory, "other-name.txt");
  writeFileSync(file, "shared\n");
  linkSync(file, other);
  const before = statSync(file).ino;
  const opened = await readFileSource(file);

  const saved = await saveFileSource(file, "changed\n", opened.mtimeMs);
  assert.equal(saved.outcome, "saved");
  // Replacing the name would have left this one on the old text.
  assert.equal(readFileSync(other, "utf8"), "changed\n");
  assert.equal(statSync(file).ino, before, "the same file, not a new one under the same name");
  assert.equal(statSync(other).nlink, 2);
  // The recovery copy is removed once the write has landed.
  assert.deepEqual(readdirSync(directory).filter((entry) => entry.endsWith(".tmp")), []);
});

test("a refused save leaves no working file behind either", async () => {
  const directory = fixture();
  const file = join(directory, "moved.txt");
  writeFileSync(file, "first\n");
  const opened = await readFileSource(file);
  writeFileSync(file, "theirs\n");
  utimesSync(file, new Date(), new Date(opened.mtimeMs + 5000));

  assert.equal((await saveFileSource(file, "mine\n", opened.mtimeMs)).outcome, "conflict");
  assert.equal(readFileSync(file, "utf8"), "theirs\n");
  assert.deepEqual(readdirSync(directory).filter((entry) => entry.endsWith(".tmp")), []);
});

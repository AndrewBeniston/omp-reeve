import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { conflictStagesFromIndex, describeReviewConflict } from "./review-conflicts.ts";
import { MAX_FACT_PATHS, readableFactPaths, readReviewFileFacts } from "./review-file-facts.ts";

/** A repository of its own, never anything the human is using. */
function fixture(t) {
  const cwd = mkdtempSync(path.join(tmpdir(), "reeve-facts-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: "pipe" }).trim();
  const write = (name, body) => writeFileSync(path.join(cwd, name), body);
  git("init", "-q", "-b", "main");
  git("config", "user.email", "fixture@example.invalid");
  git("config", "user.name", "Fixture");
  return { cwd, git, write };
}

test("every .gitattributes spelling is read the way the reference reads it", async (t) => {
  const { cwd, git, write } = fixture(t);
  write(".gitattributes", [
    "bare.lock linguist-generated",
    "true.lock linguist-generated=true",
    "false.lock linguist-generated=false",
    "unset.lock -linguist-generated",
    "shouty.lock linguist-generated=TRUE",
    "",
  ].join("\n"));
  const paths = ["bare.lock", "true.lock", "false.lock", "unset.lock", "shouty.lock", "plain.txt"];
  for (const name of paths) write(name, "contents\n");
  git("add", "."); git("commit", "-qm", "base");

  const facts = await readReviewFileFacts(cwd, paths);
  // Set and =true are generated. False, unset, an unlisted path and a
  // differently-cased value are all files the repository still shows.
  assert.deepEqual(facts.generated.sort(), ["bare.lock", "true.lock"]);
  assert.deepEqual(facts.conflicts, {});
});

test("a path is only reported when it was asked about", async (t) => {
  const { cwd, git, write } = fixture(t);
  write(".gitattributes", "*.lock linguist-generated\n");
  write("one.lock", "a\n"); write("two.lock", "b\n");
  git("add", "."); git("commit", "-qm", "base");

  assert.deepEqual((await readReviewFileFacts(cwd, ["one.lock"])).generated, ["one.lock"]);
  assert.deepEqual((await readReviewFileFacts(cwd, [])).generated, []);
});

test("a conflicted path reports the stages Git is holding it at", async (t) => {
  const { cwd, git, write } = fixture(t);
  write("both.txt", "base\n");
  write("ours-only.txt", "base\n");
  git("add", "."); git("commit", "-qm", "base");
  git("checkout", "-qb", "other");
  write("both.txt", "theirs\n");
  rmSync(path.join(cwd, "ours-only.txt"));
  git("add", "-A"); git("commit", "-qm", "other side");
  git("checkout", "-q", "main");
  write("both.txt", "ours\n");
  write("ours-only.txt", "ours\n");
  git("add", "-A"); git("commit", "-qm", "our side");
  assert.throws(() => git("merge", "other"));

  const facts = await readReviewFileFacts(cwd, ["both.txt", "ours-only.txt"]);
  assert.deepEqual(facts.conflicts["both.txt"], ["base", "ours", "theirs"]);
  assert.deepEqual(facts.conflicts["ours-only.txt"], ["base", "ours"]);
  assert.equal(describeReviewConflict(facts.conflicts["both.txt"]), "Both sides changed this file.");
  assert.equal(describeReviewConflict(facts.conflicts["ours-only.txt"]), "You changed this file and the other side deleted it.");
});

test("the unmerged index is parsed into stages, and an empty read says nothing", () => {
  const record = (stage, file) => `100644 ${"a".repeat(40)} ${stage}\t${file}\0`;
  const stages = conflictStagesFromIndex([record(1, "a.txt"), record(2, "a.txt"), record(3, "b.txt")].join(""));
  assert.deepEqual(stages, { "a.txt": ["base", "ours"], "b.txt": ["theirs"] });
  assert.deepEqual(conflictStagesFromIndex(""), {});
  assert.equal(describeReviewConflict([]), null);
  assert.equal(describeReviewConflict(["ours", "theirs"]), "Both sides added this file.");
  assert.equal(describeReviewConflict(["base", "theirs"]), "You deleted this file and the other side changed it.");
});

test("a path that does not name a file inside the repository is never asked about", () => {
  assert.deepEqual(readableFactPaths(["src/a.ts", "/etc/passwd", "../outside.txt", "C:\\windows\\x", "", "a\0b"]), ["src/a.ts"]);
  assert.deepEqual(readableFactPaths("not an array"), []);
  assert.deepEqual(readableFactPaths(["a.txt", "a.txt"]), ["a.txt"]);
  assert.equal(readableFactPaths(Array.from({ length: MAX_FACT_PATHS + 10 }, (_, n) => `f${n}.txt`)).length, MAX_FACT_PATHS);
});

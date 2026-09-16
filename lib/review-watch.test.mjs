import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { resolveReviewWatchRepository, subscribeReviewWatch } from "./review-watch.ts";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(predicate) {
  const end = Date.now() + 5000;
  while (!predicate() && Date.now() < end) await delay(20);
  assert.ok(predicate(), "watch event did not arrive");
}

test("shares a repository watch, detects nested atomic saves, ignores reads, and releases the final subscription", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "reeve-watch-"));
  const git = (...args) => execFileSync("git", ["-C", directory, ...args], { stdio: "ignore" });
  git("init", "-q");
  await mkdir(path.join(directory, "src"));
  const file = path.join(directory, "src", "file.txt");
  await writeFile(file, "before\n");
  git("add", ".");
  const repository = await resolveReviewWatchRepository(directory);
  const first = [];
  const second = [];
  const stopFirst = subscribeReviewWatch(repository, (event) => first.push(event));
  const stopSecond = subscribeReviewWatch(repository, (event) => second.push(event));
  t.after(async () => { stopFirst(); stopSecond(); await rm(directory, { recursive: true, force: true }); });
  await until(() => first.some((event) => event.type === "ready") && second.some((event) => event.type === "ready"));
  assert.equal(globalThis.__reeveReviewWatches.get(repository.root).listeners.size, 2);

  await writeFile(`${file}.tmp`, "after\n");
  await rename(`${file}.tmp`, file);
  await until(() => first.some((event) => event.type === "change") && second.some((event) => event.type === "change"));
  await delay(500);
  const count = first.length;
  await readFile(file);
  await delay(500);
  assert.equal(first.length, count, "reading the refreshed file must not cause another refresh");

  stopFirst();
  const secondCount = second.length;
  await writeFile(file, "another save\n");
  await until(() => second.length > secondCount);
  assert.equal(first.length, count);
  await rename(path.join(directory, "src"), path.join(directory, "old-src"));
  await mkdir(path.join(directory, "src"));
  await writeFile(file, "replacement directory\n");
  await delay(700);
  const afterReplacement = second.length;
  await writeFile(file, "save in replacement directory\n");
  await until(() => second.length > afterReplacement);
  stopSecond();
  assert.equal(globalThis.__reeveReviewWatches.has(repository.root), false);
});

test("an immediate cancellation leaves no shared watcher or late events", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "reeve-watch-cancel-"));
  execFileSync("git", ["-C", directory, "init", "-q"]);
  t.after(() => rm(directory, { recursive: true, force: true }));
  const repository = await resolveReviewWatchRepository(directory);
  const events = [];
  const stop = subscribeReviewWatch(repository, (event) => events.push(event));
  stop();
  await delay(400);
  assert.equal(globalThis.__reeveReviewWatches.has(repository.root), false);
  assert.deepEqual(events, []);
});

test("untracked directory coverage is reported as limited", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "reeve-watch-limited-"));
  execFileSync("git", ["-C", directory, "init", "-q"]);
  await mkdir(path.join(directory, "new", "nested"), { recursive: true });
  await writeFile(path.join(directory, "new", "nested", "file.txt"), "new\n");
  const repository = await resolveReviewWatchRepository(directory);
  const events = [];
  const stop = subscribeReviewWatch(repository, (event) => events.push(event));
  t.after(async () => { stop(); await rm(directory, { recursive: true, force: true }); });
  await until(() => events.some((event) => event.type === "ready"));
  assert.equal(events.find((event) => event.type === "ready").limited, true);
});

test("coverage lost after the stream opened is reported on its own", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "reeve-watch-limited-"));
  const git = (...args) => execFileSync("git", ["-C", directory, ...args], { stdio: "ignore" });
  git("init", "-q");
  await writeFile(path.join(directory, "file.txt"), "before\n");
  git("add", ".");
  const repository = await resolveReviewWatchRepository(directory);
  const events = [];
  const stop = subscribeReviewWatch(repository, (event) => events.push(event));
  t.after(async () => { stop(); await rm(directory, { recursive: true, force: true }); });
  await until(() => events.some((event) => event.type === "ready"));
  assert.equal(events[0].limited, false, "a fully watched Worktree opens unlimited");

  // A whole untracked tree can hold files no watcher was placed on. That is
  // coverage the reader is told about rather than left to assume, and the
  // watcher that would have said so is the one that was never placed.
  await mkdir(path.join(directory, "new", "nested"), { recursive: true });
  await writeFile(path.join(directory, "new", "nested", "file.txt"), "after\n");
  await until(() => events.some((event) => event.type === "status" && event.limited));
});

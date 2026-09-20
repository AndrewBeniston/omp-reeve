import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { hydratePartialDiff, parsePatchFiles } from "@pierre/diffs";
import { createReviewContentsLoader } from "./review-expansion.ts";
import { readReviewDiff } from "./review-git.ts";
import { readReviewFileSides } from "./review-file-contents.ts";

test("the shipped loader hydrates Pierre's full file while preserving both original hunks", async (t) => {
  const cwd = mkdtempSync(path.join(tmpdir(), "reeve-expand-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", ["-C", cwd, ...args], { stdio: "pipe" });
  git("init", "-qb", "main"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.invalid");
  const lines = Array.from({ length: 100 }, (_, n) => `line ${n + 1}\n`);
  writeFileSync(path.join(cwd, "file.txt"), lines.join("")); git("add", "."); git("commit", "-qm", "base");
  lines[20] = "first change\n"; lines[70] = "second change\n";
  writeFileSync(path.join(cwd, "file.txt"), lines.join(""));
  const scope = { kind: "unstaged" };
  const diff = await readReviewDiff(cwd, scope);
  const file = parsePatchFiles(diff.patch, undefined, true)[0].files[0];
  const boundaries = file.hunks.map((hunk) => [hunk.additionStart, hunk.deletionStart]);
  assert.equal(file.isPartial, true);
  const savedFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "/api/git/review/contents");
    const request = JSON.parse(options.body);
    assert.equal(request.revision, diff.fileRevisions["file.txt"]);
    calls++;
    return Response.json(await readReviewFileSides(request.cwd, request.scope, request.path, { revision: request.revision }));
  };
  t.after(() => { globalThis.fetch = savedFetch; });
  const errors = [];
  const context = { tabId: "review:tab", owner: { projectRoot: cwd, worktreePath: cwd, sessionId: null } };
  const load = createReviewContentsLoader({ context, scope, path: "file.txt", revision: diff.fileRevisions["file.txt"] }, new AbortController().signal, (message) => errors.push(message));
  const [loaded, repeated] = await Promise.all([load(file), load(file)]);
  assert.equal(loaded, repeated); assert.equal(calls, 1);
  hydratePartialDiff("merge", file, loaded);
  assert.equal(file.isPartial, false);
  assert.deepEqual(file.hunks.map((hunk) => [hunk.additionStart, hunk.deletionStart]), boundaries);
  assert.equal(file.hunks.length, 2);
  assert.equal(file.additionLines.join(""), lines.join(""));
  assert.deepEqual(errors, []);
});

test("stale, oversized, missing-side and mismatched-path answers never hydrate", async (t) => {
  const savedFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = savedFetch; });
  const request = {
    context: { tabId: "review:tab", owner: { projectRoot: "/fixture", worktreePath: "/fixture", sessionId: null } },
    scope: { kind: "staged" }, path: "file.txt", revision: "displayed",
  };
  const file = { name: "file.txt", type: "change" };
  for (const body of [{ status: "stale" }, { status: "too-large" }, { status: "ready", newName: "other.txt" }, { status: "ready", oldName: "file.txt", newName: "file.txt", oldContents: "old", newContents: null }]) {
    globalThis.fetch = async () => Response.json(body);
    const errors = [];
    const load = createReviewContentsLoader(request, new AbortController().signal, (message) => errors.push(message));
    await assert.rejects(load(file));
    assert.equal(errors.length, 1);
  }
});

test("an old owner's completed response is refused after cancellation", async (t) => {
  const savedFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = savedFetch; });
  let complete;
  globalThis.fetch = () => new Promise((resolve) => { complete = resolve; });
  const controller = new AbortController();
  const errors = [];
  const load = createReviewContentsLoader({
    context: { tabId: "review:old", owner: { projectRoot: "/old", worktreePath: "/old", sessionId: null } },
    scope: { kind: "staged" }, path: "file.txt", revision: "old",
  }, controller.signal, (message) => errors.push(message));
  const pending = load({ name: "file.txt", type: "change" });
  controller.abort();
  complete(Response.json({ status: "ready", oldName: "file.txt", newName: "file.txt", oldContents: "old", newContents: "new" }));
  await assert.rejects(pending, /cancelled/);
  assert.deepEqual(errors, []);
});

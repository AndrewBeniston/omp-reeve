import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { GET, POST } = await jiti.import("./route.ts");
const { allowFileRoot } = await jiti.import("../../../lib/file-access.ts");
const { getAdditionalAllowedRoots } = await jiti.import("../../../lib/allowed-roots.ts");

const GIT_IDENTITY = {
  ...process.env,
  GIT_AUTHOR_NAME: "Reeve Tests",
  GIT_AUTHOR_EMAIL: "tests@reeve.invalid",
  GIT_COMMITTER_NAME: "Reeve Tests",
  GIT_COMMITTER_EMAIL: "tests@reeve.invalid",
};

function git(cwd, ...args) {
  return execFileSync("git", ["-C", cwd, ...args], { env: GIT_IDENTITY, encoding: "utf8" }).trim();
}

function repository(t) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "reeve-worktrees-route-")));
  const main = join(base, "main");
  const previousRoots = new Set(getAdditionalAllowedRoots());
  execFileSync("git", ["init", "-b", "main", main], { env: GIT_IDENTITY });
  git(main, "commit", "--allow-empty", "-m", "initial");
  allowFileRoot(main);
  globalThis.__ompAllowedRootsCache = { roots: new Set([main]), expiresAt: Date.now() + 60_000 };
  t.after(() => {
    for (const root of getAdditionalAllowedRoots()) {
      if (!previousRoots.has(root)) getAdditionalAllowedRoots().delete(root);
    }
    globalThis.__ompAllowedRootsCache = undefined;
    rmSync(base, { recursive: true, force: true });
  });
  return { base, main };
}

function request(cwd, fields = null) {
  const url = `http://localhost/api/worktrees?cwd=${encodeURIComponent(cwd)}`;
  return fields === null
    ? new Request(url, { headers: { host: "localhost" } })
    : new Request(url, {
      method: "POST",
      headers: { host: "localhost", "Content-Type": "application/json" },
      body: JSON.stringify({ cwd, ...fields }),
    });
}

test("GET lists selectable worktrees with branch, path, detached HEAD, and current dirty status", async (t) => {
  const { base, main } = repository(t);
  const linked = join(base, "linked");
  const detached = join(base, "detached");
  git(main, "worktree", "add", "-b", "feature", linked);
  git(main, "worktree", "add", "--detach", detached, "HEAD");

  const first = await GET(request(main));
  assert.equal(first.status, 200);
  const initial = (await first.json()).worktrees;
  assert.deepEqual(initial.map(({ path, branch, isMain, isDetached, isDirty }) => ({ path, branch, isMain, isDetached, isDirty })), [
    { path: main, branch: "main", isMain: true, isDetached: false, isDirty: false },
    { path: detached, branch: null, isMain: false, isDetached: true, isDirty: false },
    { path: linked, branch: "feature", isMain: false, isDetached: false, isDirty: false },
  ]);

  const selectedDetached = await POST(request(main, { path: detached }));
  assert.equal(selectedDetached.status, 200);
  assert.equal((await selectedDetached.json()).isDetached, true);
  assert.equal(git(detached, "branch", "--show-current"), "");

  writeFileSync(join(linked, "untracked.txt"), "draft\n");
  const second = await GET(request(main));
  assert.equal(second.status, 200);
  const changed = (await second.json()).worktrees;
  assert.equal(changed.find(({ path }) => path === linked)?.isDirty, true);
  assert.equal(changed.find(({ path }) => path === main)?.isDirty, false);

  git(linked, "add", "untracked.txt");
  const staged = await GET(request(main));
  assert.equal((await staged.json()).worktrees.find(({ path }) => path === linked)?.isDirty, true);

  git(linked, "commit", "-m", "tracked");
  writeFileSync(join(linked, "untracked.txt"), "changed\n");
  const modified = await GET(request(main));
  assert.equal((await modified.json()).worktrees.find(({ path }) => path === linked)?.isDirty, true);
});

test("POST selects a listed worktree without changing its branch or dirty files", async (t) => {
  const { base, main } = repository(t);
  const linked = join(base, "linked worktree");
  git(main, "worktree", "add", "-b", "feature", linked);
  writeFileSync(join(linked, "draft.txt"), "keep me\n");

  const selected = await POST(request(main, { path: linked }));
  assert.equal(selected.status, 200);
  assert.deepEqual(await selected.json(), {
    path: linked,
    branch: "feature",
    isMain: false,
    isDetached: false,
    isDirty: true,
  });
  assert.equal(git(linked, "branch", "--show-current"), "feature");
  assert.equal(git(main, "branch", "--show-current"), "main");
  assert.equal(git(linked, "status", "--porcelain"), "?? draft.txt");
});

test("POST creates a worktree or reuses an existing branch through the branch contract", async (t) => {
  const { main } = repository(t);
  git(main, "branch", "existing");

  const existing = await POST(request(main, { branch: "existing" }));
  assert.equal(existing.status, 200);
  const existingPath = (await existing.json()).path;
  assert.equal(git(existingPath, "branch", "--show-current"), "existing");

  const created = await POST(request(main, { branch: "new-feature" }));
  assert.equal(created.status, 200);
  const createdPath = (await created.json()).path;
  assert.equal(git(createdPath, "branch", "--show-current"), "new-feature");
  assert.equal(git(main, "branch", "--show-current"), "main");
});

test("POST starts a new worktree branch at the selected base branch", async (t) => {
  const { main } = repository(t);
  git(main, "branch", "base");
  git(main, "checkout", "base");
  git(main, "commit", "--allow-empty", "-m", "base change");

  const response = await POST(request(main, { branch: "feature", startingState: "base" }));
  assert.equal(response.status, 200);
  const worktree = (await response.json()).path;
  assert.equal(git(worktree, "rev-parse", "HEAD"), git(main, "rev-parse", "base"));
  assert.notEqual(git(worktree, "rev-parse", "HEAD"), git(main, "rev-parse", "main"));
});

test("POST rejects a worktree outside the allowed Project and a disallowed cwd", async (t) => {
  const { base, main } = repository(t);
  const unrelated = join(base, "unrelated");
  execFileSync("git", ["init", "-b", "main", unrelated], { env: GIT_IDENTITY });

  const outside = await POST(request(main, { path: unrelated }));
  assert.equal(outside.status, 400);

  const denied = await POST(request(unrelated, { path: unrelated }));
  assert.equal(denied.status, 403);
});

test("GET keeps the non-Git response when the selected Project has no repository", async (t) => {
  const { base } = repository(t);
  const plain = join(base, "plain");
  mkdirSync(plain);
  globalThis.__ompAllowedRootsCache = { roots: new Set([plain]), expiresAt: Date.now() + 60_000 };

  const response = await GET(request(plain));
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.isGit, false);
  assert.deepEqual(data.worktrees, []);
});

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

// A CI runner has no global git identity. Every test commit passes one explicitly.
const GIT_TEST_IDENTITY = {
  ...process.env,
  GIT_AUTHOR_NAME: "Reeve Tests",
  GIT_AUTHOR_EMAIL: "tests@reeve.invalid",
  GIT_COMMITTER_NAME: "Reeve Tests",
  GIT_COMMITTER_EMAIL: "tests@reeve.invalid",
};
import {
  invalidateProjectCache,
  listWorktrees,
  parseRepositoryLabel,
  resolveProject,
} from "./worktree.ts";

test("parseRepositoryLabel resolves owner/repo from common origin URLs", () => {
  assert.equal(
    parseRepositoryLabel("https://github.com/ddallabenetta/omp-web.git"),
    "ddallabenetta/omp-web",
  );
  assert.equal(
    parseRepositoryLabel("https://github.com/ddallabenetta/omp-web"),
    "ddallabenetta/omp-web",
  );
  assert.equal(
    parseRepositoryLabel("git@github.com:ddallabenetta/omp-web.git"),
    "ddallabenetta/omp-web",
  );
  assert.equal(
    parseRepositoryLabel("ssh://git@github.com/ddallabenetta/omp-web.git"),
    "ddallabenetta/omp-web",
  );
  assert.equal(
    parseRepositoryLabel("github.com:ddallabenetta/omp-web.git"),
    "ddallabenetta/omp-web",
  );
  assert.equal(
    parseRepositoryLabel("git@gitlab.com:group/subgroup/omp-web.git"),
    "group/subgroup/omp-web",
  );
});

test("parseRepositoryLabel returns null when no origin repository label exists", () => {
  assert.equal(parseRepositoryLabel(""), null);
  assert.equal(parseRepositoryLabel(null), null);
  assert.equal(parseRepositoryLabel(undefined), null);
  assert.equal(parseRepositoryLabel("/Users/test/local-repo"), null);
  assert.equal(parseRepositoryLabel("file:///Users/test/local-repo"), null);
  assert.equal(parseRepositoryLabel("https://github.com/"), null);
  assert.equal(parseRepositoryLabel("https://github.com/single-segment"), null);
});

test("listWorktrees retries with the line-based format when Git rejects -z", async (t) => {
  const mainDir = mkdtempSync(join(tmpdir(), "omp-web-old-git-main-"));
  const shimDir = mkdtempSync(join(tmpdir(), "omp-web-old-git-shim-"));
  const originalPath = process.env.PATH;
  t.after(() => {
    process.env.PATH = originalPath;
    rmSync(mainDir, { recursive: true, force: true });
    rmSync(shimDir, { recursive: true, force: true });
  });

  execFileSync("git", ["init", "-b", "main", mainDir]);
  const realGit = process.platform === "win32"
    ? execFileSync("where", ["git"], { encoding: "utf8" }).split(/\r?\n/)[0]
    : execFileSync("which", ["git"], { encoding: "utf8" }).trim();
  const shimPath = join(shimDir, process.platform === "win32" ? "git.cmd" : "git");
  writeFileSync(
    shimPath,
    process.platform === "win32"
      ? `@echo off\r\nfor %%A in (%*) do if "%%~A"=="-z" exit /b 2\r\n"${realGit}" %*\r\n`
      : `#!/bin/sh\nfor arg in "$@"; do [ "$arg" = "-z" ] && exit 2; done\nexec ${JSON.stringify(realGit)} "$@"\n`,
  );
  if (process.platform !== "win32") chmodSync(shimPath, 0o755);
  process.env.PATH = `${shimDir}${process.platform === "win32" ? ";" : ":"}${originalPath}`;

  const worktrees = await listWorktrees(mainDir);

  assert.equal(worktrees.length, 1);
  assert.equal(worktrees[0].branch, "main");
});

test("resolveProject resolves repositoryLabel and branch for a git repository", async (t) => {
  const tempDir = mkdtempSync(join(tmpdir(), "omp-web-project-test-"));
  t.after(() => {
    rmSync(tempDir, { recursive: true, force: true });
    invalidateProjectCache();
  });

  execFileSync("git", ["init", "-b", "main", tempDir]);
  execFileSync("git", [
    "-C",
    tempDir,
    "remote",
    "add",
    "origin",
    "https://github.com/ddallabenetta/omp-web.git",
  ]);

  invalidateProjectCache();
  const info = await resolveProject(tempDir);
  assert.equal(info.branch, "main");
  assert.equal(info.repositoryLabel, "ddallabenetta/omp-web");
  assert.equal(info.isWorktree, false);
});

test("resolveProject returns null repositoryLabel when origin remote is absent", async (t) => {
  const tempDir = mkdtempSync(join(tmpdir(), "omp-web-no-origin-test-"));
  t.after(() => {
    rmSync(tempDir, { recursive: true, force: true });
    invalidateProjectCache();
  });

  execFileSync("git", ["init", "-b", "main", tempDir]);

  invalidateProjectCache();
  const info = await resolveProject(tempDir);
  assert.equal(info.branch, "main");
  assert.equal(info.repositoryLabel, null);
  assert.equal(info.isWorktree, false);
});

test("resolveProject resolves branch and repositoryLabel for a linked worktree", async (t) => {
  const tempDir = mkdtempSync(join(tmpdir(), "omp-web-worktree-main-"));
  const worktreeDir = mkdtempSync(join(tmpdir(), "omp-web-worktree-linked-"));
  t.after(() => {
    rmSync(tempDir, { recursive: true, force: true });
    rmSync(worktreeDir, { recursive: true, force: true });
    invalidateProjectCache();
  });

  execFileSync("git", ["init", "-b", "main", tempDir]);
  execFileSync("git", [
    "-C",
    tempDir,
    "remote",
    "add",
    "origin",
    "git@github.com:ddallabenetta/omp-web.git",
  ]);
  execFileSync("git", ["-C", tempDir, "commit", "--allow-empty", "-m", "init"], { env: GIT_TEST_IDENTITY });
  execFileSync("git", [
    "-C",
    tempDir,
    "worktree",
    "add",
    "-b",
    "feature-x",
    worktreeDir,
  ]);

  invalidateProjectCache();
  const info = await resolveProject(worktreeDir);
  assert.equal(info.branch, "feature-x");
  assert.equal(info.repositoryLabel, "ddallabenetta/omp-web");
  assert.equal(info.isWorktree, true);
  assert.equal(info.projectRoot, realpathSync(tempDir));
});

test("resolveProject resolves branch and repositoryLabel for a subdirectory", async (t) => {
  const tempDir = mkdtempSync(join(tmpdir(), "omp-web-subdir-test-"));
  const subDir = join(tempDir, "src", "nested");
  t.after(() => {
    rmSync(tempDir, { recursive: true, force: true });
    invalidateProjectCache();
  });

  execFileSync("git", ["init", "-b", "main", tempDir]);
  execFileSync("git", [
    "-C",
    tempDir,
    "remote",
    "add",
    "origin",
    "https://github.com/ddallabenetta/omp-web.git",
  ]);
  execFileSync("git", ["-C", tempDir, "commit", "--allow-empty", "-m", "init"], { env: GIT_TEST_IDENTITY });
  // node makes the directory. "mkdir -p" is a Unix command and Windows has no
  // executable by that name.
  mkdirSync(subDir, { recursive: true });

  invalidateProjectCache();
  const info = await resolveProject(subDir);
  assert.equal(info.branch, "main");
  assert.equal(info.repositoryLabel, "ddallabenetta/omp-web");
  assert.equal(info.isTopLevel, false);
});

test("resolveProject returns null branch on detached HEAD", async (t) => {
  const tempDir = mkdtempSync(join(tmpdir(), "omp-web-detached-test-"));
  t.after(() => {
    rmSync(tempDir, { recursive: true, force: true });
    invalidateProjectCache();
  });

  execFileSync("git", ["init", "-b", "main", tempDir]);
  execFileSync("git", [
    "-C",
    tempDir,
    "remote",
    "add",
    "origin",
    "https://github.com/ddallabenetta/omp-web.git",
  ]);
  execFileSync("git", ["-C", tempDir, "commit", "--allow-empty", "-m", "init"], { env: GIT_TEST_IDENTITY });
  execFileSync("git", ["-C", tempDir, "checkout", "--detach"]);

  invalidateProjectCache();
  const info = await resolveProject(tempDir);
  assert.equal(info.branch, null);
  assert.equal(info.repositoryLabel, "ddallabenetta/omp-web");
});

test("resolveProject handles non-git directory", async (t) => {
  const tempDir = mkdtempSync(join(tmpdir(), "omp-web-nongit-test-"));
  t.after(() => {
    rmSync(tempDir, { recursive: true, force: true });
    invalidateProjectCache();
  });

  invalidateProjectCache();
  const info = await resolveProject(tempDir);
  assert.equal(info.branch, null);
  assert.equal(info.repositoryLabel, null);
  assert.equal(info.isWorktree, false);
  assert.equal(info.projectRoot, tempDir);
});

test("resolveProject caches project info until invalidated", async (t) => {
  const tempDir = mkdtempSync(join(tmpdir(), "omp-web-cache-test-"));
  t.after(() => {
    rmSync(tempDir, { recursive: true, force: true });
    invalidateProjectCache();
  });

  execFileSync("git", ["init", "-b", "main", tempDir]);
  execFileSync("git", [
    "-C",
    tempDir,
    "remote",
    "add",
    "origin",
    "https://github.com/ddallabenetta/omp-web.git",
  ]);

  invalidateProjectCache();
  const info1 = await resolveProject(tempDir);
  const info2 = await resolveProject(tempDir);
  assert.equal(info1, info2);

  invalidateProjectCache();
  const info3 = await resolveProject(tempDir);
  assert.notEqual(info1, info3);
  assert.deepEqual(info1, info3);
});

test("listWorktrees keeps usable worktrees when one status check fails", async (t) => {
  const mainDir = mkdtempSync(join(tmpdir(), "omp-web-worktree-status-main-"));
  const linkedDir = mkdtempSync(join(tmpdir(), "omp-web-worktree-status-linked-"));
  t.after(() => {
    rmSync(mainDir, { recursive: true, force: true });
    rmSync(linkedDir, { recursive: true, force: true });
  });

  execFileSync("git", ["init", "-b", "main", mainDir]);
  execFileSync("git", ["-C", mainDir, "commit", "--allow-empty", "-m", "init"], { env: GIT_TEST_IDENTITY });
  execFileSync("git", ["-C", mainDir, "worktree", "add", "-b", "feature", linkedDir]);
  rmSync(join(linkedDir, ".git"));
  writeFileSync(join(linkedDir, ".git"), "invalid worktree metadata\n");

  const worktrees = await listWorktrees(mainDir);

  assert.equal(worktrees.length, 2);
  assert.equal(worktrees.find(({ path }) => path === realpathSync(mainDir))?.isDirty, false);
  assert.equal(worktrees.find(({ path }) => path === realpathSync(linkedDir))?.isDirty, true);
});

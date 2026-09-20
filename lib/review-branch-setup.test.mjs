import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { applyBranchSetup, readBranchChoices } from "./review-branch-setup.ts";
import { branchChoiceUnavailable, resolveBranchSetup } from "./review-branch-rules.ts";

/** A repository of its own, never anything the human is using. */
function fixture(t) {
  const cwd = mkdtempSync(path.join(tmpdir(), "reeve-branch-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
  git("init", "-q", "-b", "main");
  git("config", "user.email", "fixture@example.invalid");
  git("config", "user.name", "Fixture");
  writeFileSync(path.join(cwd, "base.txt"), "base\n");
  git("add", "."); git("commit", "-qm", "base");
  return { cwd, git };
}

const CHOICES = {
  current: "main",
  branches: [
    { name: "main", checkedOutAt: "/repo", current: true },
    { name: "free", checkedOutAt: null, current: false },
    { name: "held", checkedOutAt: "/repo-worktrees/held", current: false },
  ],
};

test("the rules refuse a name Git would not take, before Git is asked", () => {
  assert.deepEqual(resolveBranchSetup({ mode: "create", name: "  " }, CHOICES), { ok: false, refusal: "branch-empty" });
  assert.deepEqual(resolveBranchSetup({ mode: "create", name: "bad name" }, CHOICES), { ok: false, refusal: "branch-invalid" });
  assert.deepEqual(resolveBranchSetup({ mode: "create", name: "free" }, CHOICES), { ok: false, refusal: "branch-exists" });
  assert.deepEqual(resolveBranchSetup({ mode: "create", name: "codex/new" }, CHOICES), { ok: true, action: { mode: "create", name: "codex/new" } });
});

test("a branch another Worktree holds is refused rather than attempted", () => {
  assert.deepEqual(resolveBranchSetup({ mode: "checkout", name: "held" }, CHOICES), { ok: false, refusal: "checked-out-elsewhere" });
  assert.deepEqual(resolveBranchSetup({ mode: "checkout", name: "main" }, CHOICES), { ok: false, refusal: "already-current" });
  assert.deepEqual(resolveBranchSetup({ mode: "checkout", name: "gone" }, CHOICES), { ok: false, refusal: "branch-missing" });
  assert.deepEqual(resolveBranchSetup({ mode: "checkout", name: "free" }, CHOICES), { ok: true, action: { mode: "checkout", name: "free" } });
});

test("the control says why a choice is unavailable", () => {
  assert.equal(branchChoiceUnavailable(CHOICES.branches[0]), "already-current");
  assert.equal(branchChoiceUnavailable(CHOICES.branches[1]), null);
  assert.equal(branchChoiceUnavailable(CHOICES.branches[2]), "checked-out-elsewhere");
});

test("creating a branch moves the Worktree onto it, and Git agrees", async (t) => {
  const { cwd, git } = fixture(t);
  const result = await applyBranchSetup({ cwd, mode: "create", name: "codex/work-here" });
  assert.equal(result.status, "switched");
  assert.equal(result.created, true);
  assert.equal(result.from, "main");
  assert.equal(git("rev-parse", "--abbrev-ref", "HEAD"), "codex/work-here");
});

test("a name already taken is refused, and the Worktree stays where it was", async (t) => {
  const { cwd, git } = fixture(t);
  git("branch", "taken");
  const result = await applyBranchSetup({ cwd, mode: "create", name: "taken" });
  assert.equal(result.status, "refused");
  assert.equal(result.refusal, "branch-exists");
  assert.equal(git("rev-parse", "--abbrev-ref", "HEAD"), "main");
});

test("an existing free branch is checked out without being created", async (t) => {
  const { cwd, git } = fixture(t);
  git("branch", "free");
  const result = await applyBranchSetup({ cwd, mode: "checkout", name: "free" });
  assert.equal(result.status, "switched");
  assert.equal(result.created, false);
  assert.equal(git("rev-parse", "--abbrev-ref", "HEAD"), "free");
});

test("a branch checked out in another Worktree is refused, and both Worktrees stay put", async (t) => {
  const { cwd, git } = fixture(t);
  const elsewhere = mkdtempSync(path.join(tmpdir(), "reeve-branch-linked-"));
  t.after(() => rmSync(elsewhere, { recursive: true, force: true }));
  const linked = path.join(elsewhere, "held");
  git("worktree", "add", "-q", "-b", "held", linked);

  const choices = await readBranchChoices(cwd);
  const held = choices.branches.find((branch) => branch.name === "held");
  assert.ok(held.checkedOutAt, "the linked Worktree is reported as holding the branch");

  const result = await applyBranchSetup({ cwd, mode: "checkout", name: "held" });
  assert.equal(result.status, "refused");
  assert.equal(result.refusal, "checked-out-elsewhere");
  assert.equal(git("rev-parse", "--abbrev-ref", "HEAD"), "main");
  assert.equal(execFileSync("git", ["-C", linked, "rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8" }).trim(), "held");
  git("worktree", "remove", "--force", linked);
});

test("an invalid name never reaches a write", async (t) => {
  const { cwd, git } = fixture(t);
  const result = await applyBranchSetup({ cwd, mode: "create", name: "--force" });
  assert.equal(result.status, "refused");
  assert.equal(result.refusal, "branch-invalid");
  assert.equal(git("for-each-ref", "--format=%(refname:short)", "refs/heads/"), "main");
});

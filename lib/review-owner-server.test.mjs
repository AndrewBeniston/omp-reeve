import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { allowFileRoot } from "./file-access.ts";
import { reviewOwnerFields } from "./review-owner.ts";
import { authorizeReviewOwner, matchRegisteredReviewTab, registerReviewOwner } from "./review-owner-server.ts";
import { writeRegisteredReviewTab } from "./review-tab-registry.ts";

/**
 * A Project of its own with two Worktrees, a second Project beside it, and
 * Sessions that exist only here. No Project or Session a human is using
 * appears in any of it.
 */
function fixture(t) {
  const agentDir = realpathSync(mkdtempSync(path.join(tmpdir(), "reeve-owner-agent-")));
  const workspace = realpathSync(mkdtempSync(path.join(tmpdir(), "reeve-owner-")));
  t.after(() => {
    rmSync(agentDir, { recursive: true, force: true });
    rmSync(workspace, { recursive: true, force: true });
    globalThis.__ompSessionListCache = undefined;
  });

  const repository = (name) => {
    const root = path.join(workspace, name);
    execFileSync("git", ["init", "-q", "-b", "main", root]);
    const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
    git("config", "user.email", "fixture@example.invalid");
    git("config", "user.name", "Fixture");
    writeFileSync(path.join(root, "base.txt"), "base\n");
    git("add", "."); git("commit", "-qm", "base");
    return { root, git };
  };

  const project = repository("project");
  const other = repository("other");
  const worktree = path.join(workspace, "project-tree");
  project.git("worktree", "add", "-q", "-b", "feature", worktree);

  for (const root of [project.root, other.root, worktree]) allowFileRoot(root);

  // The Sessions this machine would report, supplied rather than scanned.
  globalThis.__ompSessionListCache = {
    ts: Date.now(),
    data: [
      { id: "s-1", cwd: project.root, projectRoot: project.root },
      { id: "s-2", cwd: project.root, projectRoot: project.root },
      { id: "s-3", cwd: worktree, projectRoot: project.root },
    ],
  };

  return { agentDir, projectRoot: project.root, worktree, otherRoot: other.root };
}

const request = (tabId, owner) => ({ ...reviewOwnerFields({ tabId, owner }) });

/** Opening a Tab, as the endpoint does it: resolve the owner, then store it. */
async function open(agentDir, cwd, sessionId) {
  const registered = await registerReviewOwner(cwd, sessionId, agentDir);
  if (registered.status === "authorized") {
    writeRegisteredReviewTab({ tabId: registered.tabId, owner: registered.owner, selection: null }, agentDir);
  }
  return registered;
}

test("a Tab is bound to the Project, Worktree and Session it was opened with", async (t) => {
  const { agentDir, projectRoot } = fixture(t);
  const registered = await open(agentDir, projectRoot, "s-1");
  assert.equal(registered.status, "authorized");
  assert.deepEqual(registered.owner, { projectRoot, worktreePath: projectRoot, sessionId: "s-1" });

  const answered = await authorizeReviewOwner(request(registered.tabId, registered.owner), { agentDir });
  assert.equal(answered.status, "authorized");
});

test("the other Session in the same Worktree cannot use this Tab", async (t) => {
  const { agentDir, projectRoot } = fixture(t);
  const registered = await open(agentDir, projectRoot, "s-1");

  // Every path in this tuple is real, the Session exists, and it is working in
  // this very directory. It is refused because the Tab is not its Tab.
  const swapped = await authorizeReviewOwner(
    request(registered.tabId, { ...registered.owner, sessionId: "s-2" }), { agentDir });
  assert.equal(swapped.status, "refused");
  assert.equal(swapped.reason, "owner-mismatch");

  const dropped = await authorizeReviewOwner(
    request(registered.tabId, { ...registered.owner, sessionId: null }), { agentDir });
  assert.equal(dropped.reason, "owner-mismatch");
});

test("a Tab reads its own Worktree and not the Project's other one", async (t) => {
  const { agentDir, projectRoot, worktree } = fixture(t);
  const inWorktree = await open(agentDir, worktree, "s-3");
  assert.equal(inWorktree.status, "authorized");
  assert.equal(inWorktree.owner.projectRoot, projectRoot);

  const elsewhere = await authorizeReviewOwner(
    request(inWorktree.tabId, { ...inWorktree.owner, worktreePath: projectRoot }), { agentDir });
  assert.equal(elsewhere.reason, "owner-mismatch");
});

test("a Session working somewhere else cannot be bound here", async (t) => {
  const { agentDir, projectRoot } = fixture(t);
  const foreign = await registerReviewOwner(projectRoot, "s-3", agentDir);
  assert.equal(foreign.reason, "session-mismatch");

  // A Session OMP does not list is a different answer: the chat may exist
  // without a file yet, and the caller can still open the Project.
  const absent = await registerReviewOwner(projectRoot, "s-none", agentDir);
  assert.equal(absent.reason, "session-unknown");
  assert.equal((await registerReviewOwner(projectRoot, null, agentDir)).status, "authorized");
});

test("a Project the request names is the Project Git resolves, and a root outside is refused", async (t) => {
  const { agentDir, projectRoot, worktree, otherRoot } = fixture(t);
  const registered = await open(agentDir, projectRoot, "s-1");

  const claimed = await authorizeReviewOwner(
    request(registered.tabId, { ...registered.owner, projectRoot: otherRoot }), { agentDir });
  assert.equal(claimed.reason, "owner-mismatch");

  // A binding registered for one Project, then asked about another Project's
  // directory, fails on the Project Git resolves rather than on the claim.
  const invented = await authorizeReviewOwner(
    { tabId: registered.tabId, cwd: otherRoot, projectRoot: otherRoot }, { agentDir });
  assert.equal(invented.reason, "owner-mismatch");

  const unreachable = await registerReviewOwner(path.join(worktree, "..", "nowhere"), null, agentDir);
  assert.equal(unreachable.reason, "denied");
});

test("an unregistered Tab authorizes nothing", async (t) => {
  const { agentDir, projectRoot } = fixture(t);
  const answered = await authorizeReviewOwner(
    request("review:invented", { projectRoot, worktreePath: projectRoot, sessionId: "s-1" }), { agentDir });
  assert.equal(answered.reason, "unregistered-tab");
});

test("a Project with no Session opens a Tab that stays without one", async (t) => {
  const { agentDir, projectRoot } = fixture(t);
  const registered = await open(agentDir, projectRoot, null);
  assert.equal(registered.status, "authorized");
  assert.equal(registered.owner.sessionId, null);

  const promoted = await authorizeReviewOwner(
    request(registered.tabId, { ...registered.owner, sessionId: "s-1" }), { agentDir });
  assert.equal(promoted.reason, "owner-mismatch");
});

test("a Tab whose Worktree has gone can still be forgotten, and only by its owner", async (t) => {
  const { agentDir, projectRoot, worktree } = fixture(t);
  const registered = await open(agentDir, worktree, "s-3");
  rmSync(worktree, { recursive: true, force: true });

  const live = await authorizeReviewOwner(request(registered.tabId, registered.owner), { agentDir });
  assert.equal(live.reason, "denied");

  const closing = matchRegisteredReviewTab(request(registered.tabId, registered.owner), agentDir);
  assert.equal(closing.status, "authorized");

  const someoneElse = matchRegisteredReviewTab(
    request(registered.tabId, { projectRoot, worktreePath: projectRoot, sessionId: "s-1" }), agentDir);
  assert.equal(someoneElse.reason, "owner-mismatch");
});

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { reviewTabIdFor } from "./review-owner.ts";
import {
  findRegisteredReviewTab,
  readProjectReviewTabs,
  removeRegisteredReviewTab,
  ReviewTabRegistryUnreadable,
  updateRegisteredReviewTab,
  writeRegisteredReviewTab,
} from "./review-tab-registry.ts";

const REGISTRY = "omp-web-review-tabs.json";

/** A registry directory of its own, never the one Reeve is using. */
function agentDir(t) {
  const directory = mkdtempSync(path.join(tmpdir(), "reeve-review-tabs-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function tab(projectRoot, worktreePath, sessionId = null, selection = null, active = false) {
  const owner = { projectRoot, worktreePath, sessionId };
  return { tabId: reviewTabIdFor(owner), owner, selection, active };
}

test("a Tab comes back with its whole owner and its selection", (t) => {
  const directory = agentDir(t);
  const stored = tab("/projects/app", "/projects/app/tree", "s-1",
    { kind: "branch", comparisonBranch: "refs/heads/main", comparisonLabel: "main", commit: "" });
  writeRegisteredReviewTab(stored, directory);

  assert.deepEqual(readProjectReviewTabs("/projects/app", directory), [stored]);
  assert.deepEqual(findRegisteredReviewTab(stored.tabId, directory), stored);
  assert.deepEqual(readProjectReviewTabs("/projects/other", directory), []);
});

test("two Sessions in one Worktree are remembered apart", (t) => {
  const directory = agentDir(t);
  const first = tab("/projects/app", "/projects/app", "s-1");
  const second = tab("/projects/app", "/projects/app", "s-2");
  writeRegisteredReviewTab(first, directory);
  writeRegisteredReviewTab(second, directory);

  const remembered = readProjectReviewTabs("/projects/app", directory);
  assert.equal(remembered.length, 2);
  assert.equal(findRegisteredReviewTab(first.tabId, directory).owner.sessionId, "s-1");
  assert.equal(findRegisteredReviewTab(second.tabId, directory).owner.sessionId, "s-2");

  removeRegisteredReviewTab(first.tabId, directory);
  assert.deepEqual(readProjectReviewTabs("/projects/app", directory), [second]);
});

test("a record whose id does not match its owner is not a binding", (t) => {
  const directory = agentDir(t);
  const honest = tab("/projects/app", "/projects/app/tree", "s-1");
  writeFileSync(path.join(directory, REGISTRY), JSON.stringify({
    "/projects/app": [
      { ...honest, tabId: "review:minted-elsewhere" },
      honest,
    ],
  }));

  assert.equal(findRegisteredReviewTab("review:minted-elsewhere", directory), null);
  assert.deepEqual(readProjectReviewTabs("/projects/app", directory), [honest]);
});

test("a registry that cannot be read is never reported as empty, and never written over", (t) => {
  const directory = agentDir(t);
  const kept = tab("/projects/app", "/projects/app", "s-1");
  writeRegisteredReviewTab(kept, directory);
  const file = path.join(directory, REGISTRY);
  const before = readFileSync(file, "utf8");
  writeFileSync(file, `${before.slice(0, before.length / 2)}`);
  const damaged = readFileSync(file, "utf8");

  assert.throws(() => readProjectReviewTabs("/projects/app", directory), ReviewTabRegistryUnreadable);
  assert.throws(() => writeRegisteredReviewTab(tab("/projects/app", "/projects/app", "s-2"), directory), ReviewTabRegistryUnreadable);
  assert.throws(() => removeRegisteredReviewTab(kept.tabId, directory), ReviewTabRegistryUnreadable);
  assert.equal(readFileSync(file, "utf8"), damaged);
  // A registry nobody can read is not a Tab nobody registered, so the lookup
  // says so rather than answering "no such Tab".
  assert.throws(() => findRegisteredReviewTab(kept.tabId, directory), ReviewTabRegistryUnreadable);
});

test("a registry that is not there yet is simply empty", (t) => {
  const directory = agentDir(t);
  assert.deepEqual(readProjectReviewTabs("/projects/app", directory), []);
  assert.equal(findRegisteredReviewTab("review:none", directory), null);
  const first = tab("/projects/app", "/projects/app");
  writeRegisteredReviewTab(first, directory);
  assert.deepEqual(readProjectReviewTabs("/projects/app", directory), [first]);
});

test("a selection saved after the Tab was closed does not bring it back", (t) => {
  const directory = agentDir(t);
  const open = tab("/projects/app", "/projects/app", "s-1");
  writeRegisteredReviewTab(open, directory);

  const reading = { ...open, selection: { kind: "staged", comparisonBranch: "", comparisonLabel: "", commit: "" } };
  assert.equal(updateRegisteredReviewTab(reading, directory), true);
  assert.deepEqual(readProjectReviewTabs("/projects/app", directory), [reading]);

  removeRegisteredReviewTab(open.tabId, directory);
  assert.equal(updateRegisteredReviewTab(reading, directory), false);
  assert.deepEqual(readProjectReviewTabs("/projects/app", directory), []);
});

test("an update changes what a Tab is reviewing and never who owns it", (t) => {
  const directory = agentDir(t);
  const open = tab("/projects/app", "/projects/app", "s-1");
  writeRegisteredReviewTab(open, directory);

  updateRegisteredReviewTab({ ...open, owner: { ...open.owner, sessionId: "s-2" } }, directory);
  assert.equal(findRegisteredReviewTab(open.tabId, directory).owner.sessionId, "s-1");
});

test("the Tab that was in front of an open panel is remembered as such", (t) => {
  const directory = agentDir(t);
  const front = tab("/projects/app", "/projects/app", "s-1", null, true);
  const behind = tab("/projects/app", "/projects/app", "s-2", null, false);
  writeRegisteredReviewTab(front, directory);
  writeRegisteredReviewTab(behind, directory);

  const remembered = readProjectReviewTabs("/projects/app", directory);
  assert.deepEqual(remembered.filter((entry) => entry.active).map((entry) => entry.owner.sessionId), ["s-1"]);
});

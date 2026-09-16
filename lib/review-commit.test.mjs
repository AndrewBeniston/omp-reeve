import assert from "node:assert/strict";
import test from "node:test";
import {
  accountIndex,
  commitDisabledReason,
  commitStagingRequirement,
  resolveBranchTarget,
  scopeCanCommit,
  staleReviewedFiles,
  validateCommitMessage,
} from "./review-commit.ts";
import { formatConventionalCommit } from "./review-commit-message.ts";

test("committing is offered where the scope describes the index", () => {
  assert.equal(scopeCanCommit("staged"), true);
  assert.equal(scopeCanCommit("uncommitted"), true);
  for (const kind of ["unstaged", "branch", "commit"]) assert.equal(scopeCanCommit(kind), false);
});

test("the action says why it is off, in the order that matters", () => {
  assert.equal(commitDisabledReason({ committing: true, loading: true, repositoryAvailable: false, changeCount: 0 }), "unavailable");
  assert.equal(commitDisabledReason({ committing: true, loading: true, repositoryAvailable: true, changeCount: 1 }), "committing");
  assert.equal(commitDisabledReason({ committing: false, loading: true, repositoryAvailable: true, changeCount: 1 }), "loadingDiff");
  assert.equal(commitDisabledReason({ committing: false, loading: false, repositoryAvailable: true, changeCount: 0 }), "noChanges");
  assert.equal(commitDisabledReason({ committing: false, loading: false, repositoryAvailable: true, changeCount: 2 }), null);
});

test("staging is forced only when the index holds nothing", () => {
  // Nothing on screen is unstaged: staging does not arise.
  assert.equal(commitStagingRequirement({ unstagedCount: 0, indexCount: 3 }), "none");
  assert.equal(commitStagingRequirement({ unstagedCount: 0, indexCount: 0 }), "none");
  /*
   * The case this rule exists for: a staged hunk beside an unrelated unstaged
   * file. Committing the index alone is an ordinary act, so staging is
   * offered rather than demanded, and the unrelated file is left alone.
   */
  assert.equal(commitStagingRequirement({ unstagedCount: 1, indexCount: 1 }), "optional");
  // With an empty index there is nothing else to commit, so staging is the act.
  assert.equal(commitStagingRequirement({ unstagedCount: 2, indexCount: 0 }), "required");
});

test("the index is counted whole, so nothing staged elsewhere travels unseen", () => {
  const accounting = accountIndex(["src/a.ts"], ["src/a.ts", "secrets/.env", "docs/b.md"]);
  assert.deepEqual(accounting.hidden, ["docs/b.md", "secrets/.env"]);
  assert.deepEqual(accounting.index, ["docs/b.md", "secrets/.env", "src/a.ts"]);
  // Nothing outside the review means nothing to disclose.
  assert.deepEqual(accountIndex(["src/a.ts", "src/b.ts"], ["src/a.ts"]).hidden, []);
});

test("a message keeps its subject and body apart the way Git reads them", () => {
  const valid = validateCommitMessage("  Add the review pill\n\nIt floats over the diff.\n");
  assert.equal(valid.ok, true);
  assert.equal(valid.message.subject, "Add the review pill");
  assert.equal(valid.message.text, "Add the review pill\n\nIt floats over the diff.");
  assert.equal(validateCommitMessage("One line").message.text, "One line");
  assert.equal(validateCommitMessage("   ").ok, false);
  assert.equal(validateCommitMessage("").problem, "empty");
});

test("a branch name is checked before anything is written", () => {
  assert.deepEqual(resolveBranchTarget({ requested: null, existingBranches: ["main"] }), { ok: true, target: { create: null } });
  assert.deepEqual(resolveBranchTarget({ requested: " codex/review ", existingBranches: ["main"] }), { ok: true, target: { create: "codex/review" } });
  assert.equal(resolveBranchTarget({ requested: "main", existingBranches: ["main"] }).problem, "exists");
  assert.equal(resolveBranchTarget({ requested: "  ", existingBranches: [] }).problem, "empty");
  for (const name of ["-bad", "has space", "dots..here", "ref@{0}", "trailing/", "thing.lock"]) {
    assert.equal(resolveBranchTarget({ requested: name, existingBranches: [] }).problem, "invalid", name);
  }
});

test("a generated conventional commit reads as one message", () => {
  assert.equal(
    formatConventionalCommit({ type: "feat", scope: "review", summary: "add the commit form", body: ["It reads the index."], footers: [] }),
    "feat(review): add the commit form\n\nIt reads the index.",
  );
  assert.equal(
    formatConventionalCommit({ type: "fix", scope: null, summary: "stop staging on generate", body: [], footers: ["Refs: #75"] }),
    "fix: stop staging on generate\n\nRefs: #75",
  );
});

test("a file edited since the form displayed it is named as stale", () => {
  const displayed = { "one.txt": "rev-1", "two.txt": "rev-2" };
  assert.deepEqual(staleReviewedFiles(displayed, { "one.txt": "rev-1", "two.txt": "rev-2" }), []);
  // Edited since, and gone from the diff entirely, both count as moved on.
  assert.deepEqual(staleReviewedFiles(displayed, { "one.txt": "rev-9", "two.txt": "rev-2" }), ["one.txt"]);
  assert.deepEqual(staleReviewedFiles(displayed, { "two.txt": "rev-2" }), ["one.txt"]);
  // A file the form never showed is not its business.
  assert.deepEqual(staleReviewedFiles(displayed, { ...displayed, "three.txt": "rev-3" }), []);
});

import assert from "node:assert/strict";
import test from "node:test";
import { reviewEmptyState, reviewEmptyStateModel } from "./review-empty-state.ts";

test("staged and unstaged are separate states, and staged says how to fill it", () => {
  const staged = reviewEmptyStateModel({ kind: "no-changes", scope: "staged" });
  const unstaged = reviewEmptyStateModel({ kind: "no-changes", scope: "unstaged" });
  assert.equal(staged.title, "No staged changes");
  assert.match(staged.description, /stage/i);
  assert.equal(unstaged.title, "No unstaged changes");
  assert.notEqual(staged.description, unstaged.description);
});

test("a filter hiding everything is not the same state as having no changes", () => {
  const filtered = reviewEmptyStateModel({ kind: "filtered", filter: "route" });
  const empty = reviewEmptyStateModel({ kind: "no-changes", scope: "uncommitted" });
  assert.notEqual(filtered.title, empty.title);
  assert.match(filtered.description, /route/);
  assert.deepEqual(filtered.actions.map((action) => action.kind), ["clearFilter"]);
});

test("a directory outside a repository offers to start one, and nothing else", () => {
  const model = reviewEmptyStateModel({
    kind: "unavailable",
    reason: "not-a-repository",
    title: "No Git repository here",
    description: "This directory is not in a Git repository.",
    retryable: false,
  }, { branchComparison: { value: "refs/remotes/origin/main", label: "origin/main" } });
  assert.deepEqual(model.actions.map((action) => action.kind), ["createRepository"]);
});

test("an unavailable state offers a retry only where retrying could work", () => {
  const missing = reviewEmptyStateModel({
    kind: "unavailable", reason: "git-missing", title: "Git is not available",
    description: "Git was not found on this computer.", retryable: false,
  }, { branchComparison: { value: "refs/remotes/origin/main", label: "origin/main" } });
  assert.deepEqual(missing.actions, []);

  const pending = reviewEmptyStateModel({
    kind: "unavailable", reason: "in-progress", title: "Last turn is still running",
    description: "This prompt is still running.", retryable: true,
  });
  assert.deepEqual(pending.actions.map((action) => action.kind), ["retry"]);
});

test("a failed read offers a retry and keeps the reason it was given", () => {
  const model = reviewEmptyStateModel({ kind: "error", description: "Changes could not be loaded." });
  assert.equal(model.description, "Changes could not be loaded.");
  assert.deepEqual(model.actions.map((action) => action.kind), ["retry"]);
});

test("a state the caller has already worded keeps its words and gains the way forward", () => {
  const model = reviewEmptyStateModel(
    { kind: "stated", title: "No reviewable changes", description: "The untracked files described above are the only changes here." },
    { branchComparison: { value: "refs/remotes/origin/main", label: "origin/main" }, scope: "uncommitted" },
  );
  assert.equal(model.title, "No reviewable changes");
  assert.deepEqual(model.actions.map((action) => action.kind), ["viewBranchDiff"]);
});

test("the next useful comparison is offered where one exists", () => {
  const branch = { value: "refs/remotes/origin/main", label: "origin/main" };
  const offered = reviewEmptyStateModel({ kind: "no-changes", scope: "staged" }, { branchComparison: branch });
  // The human reads the short name; Git is handed the ref it can resolve.
  assert.deepEqual(offered.actions, [{ kind: "viewBranchDiff", label: "View changes against origin/main", branch }]);

  // A branch review is already that comparison.
  assert.deepEqual(reviewEmptyStateModel({ kind: "no-changes", scope: "branch" }, { branchComparison: branch }).actions, []);
  // No comparison is known, so none is offered.
  assert.deepEqual(reviewEmptyStateModel({ kind: "no-changes", scope: "staged" }, { branchComparison: { value: "  ", label: "" } }).actions, []);
});

test("an empty recorded turn claims nothing about what happened to its changes", () => {
  const recorded = reviewEmptyStateModel({ kind: "no-changes", scope: "lastTurn", lastTurnRecorded: true });
  assert.equal(recorded.description, reviewEmptyState("lastTurn", true).description);
  assert.doesNotMatch(recorded.description, /committed|reverted/i);
  // An unrecorded turn is a different absence again, and neither says where
  // the changes went.
  const unrecorded = reviewEmptyStateModel({ kind: "no-changes", scope: "lastTurn" });
  assert.notEqual(unrecorded.description, recorded.description);
  assert.doesNotMatch(unrecorded.description, /committed|reverted/i);
});

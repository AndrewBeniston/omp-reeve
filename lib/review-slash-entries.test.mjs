import assert from "node:assert/strict";
import test from "node:test";
import {
  REVIEW_SLASH_ENTRIES,
  describeGitUnusable,
  parseReviewSlashCommand,
  reviewBaseBranchChoices,
} from "./review-slash-entries.ts";

test("Review is a submenu of two questions, not one command", () => {
  assert.deepEqual(REVIEW_SLASH_ENTRIES.map((entry) => entry.id), ["uncommitted", "branch"]);
  assert.equal(REVIEW_SLASH_ENTRIES[1].needsBranch, true);
});

test("what the human typed resolves to an entry and a base", () => {
  assert.equal(parseReviewSlashCommand("/compact"), null);
  assert.equal(parseReviewSlashCommand("/review").entry.id, "uncommitted");
  assert.equal(parseReviewSlashCommand("/review uncommitted be brief").message, "be brief");
  const branch = parseReviewSlashCommand("/review branch main only the API");
  assert.equal(branch.base, "main");
  assert.equal(branch.message, "only the API");
  // A branch entry with no branch names none, so the caller shows the list.
  assert.equal(parseReviewSlashCommand("/review branch").base, null);
});

test("the branch list is seeded with the default target and de-duplicated", () => {
  const choices = reviewBaseBranchChoices({
    defaultBranch: "main",
    currentBranch: "feature",
    recentBranches: ["feature", "main", "release"],
  });
  assert.deepEqual(choices, ["main", "feature", "release"]);
  // A repository with no default target still offers what it has.
  assert.deepEqual(reviewBaseBranchChoices({ defaultBranch: null, currentBranch: null, recentBranches: ["old"] }), ["old"]);
});

test("an unaccepted Xcode licence is explained with the command that clears it", () => {
  const message = describeGitUnusable("Agreeing to the Xcode/iOS license requires admin privileges");
  assert.match(message, /sudo xcodebuild -license/);
  // Anything else keeps Git's own words, which say more than a paraphrase.
  assert.match(describeGitUnusable("fatal: not a git repository"), /not a git repository/);
});

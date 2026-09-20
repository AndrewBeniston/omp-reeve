import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { ReviewEmptyState } = await jiti.import("./ReviewEmptyState.tsx");

const text = (markup) => markup.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const render = (props) => renderToStaticMarkup(React.createElement(ReviewEmptyState, props));

test("an offered action is drawn, and one with nowhere to go is not", () => {
  const offered = render({
    situation: { kind: "filtered", filter: "route" },
    onClearFilter() {},
  });
  assert.match(text(offered), /No files match this filter/);
  assert.match(text(offered), /Clear the filter/);

  // The same state with no handler says what it knows and offers nothing.
  const bare = render({ situation: { kind: "filtered", filter: "route" } });
  assert.match(text(bare), /No files match this filter/);
  assert.doesNotMatch(text(bare), /Clear the filter/);
});

test("a directory outside a repository offers to start one, and a missing Git does not", () => {
  const create = {
    situation: { kind: "unavailable", reason: "not-a-repository", title: "No Git repository here", description: "This directory is not in a Git repository.", retryable: false },
    branchComparison: { value: "refs/remotes/origin/main", label: "origin/main" },
    onCreateRepository: async () => ({ status: "created", repositoryRoot: "/tmp/x" }),
    onRetry() {},
    onViewBranchDiff() {},
  };
  assert.match(text(render(create)), /Create a Git repository/);

  const missing = render({
    situation: { kind: "unavailable", reason: "git-missing", title: "Git is not available", description: "Git was not found on this computer.", retryable: false },
    branchComparison: { value: "refs/remotes/origin/main", label: "origin/main" },
    onCreateRepository: create.onCreateRepository,
    onRetry() {},
    onViewBranchDiff() {},
  });
  assert.doesNotMatch(text(missing), /Create a Git repository|View changes against/);
});

test("a failed read is announced as one, and an empty one is not", () => {
  assert.match(render({ situation: { kind: "error", description: "Changes could not be loaded." }, onRetry() {} }), /role="alert"/);
  assert.match(render({ situation: { kind: "no-changes", scope: "staged" } }), /role="status"/);
});

test("a comparison is offered by its short name and opened by its ref", () => {
  const markup = render({
    situation: { kind: "no-changes", scope: "staged" },
    branchComparison: { value: "refs/remotes/origin/main", label: "origin/main" },
    onViewBranchDiff() {},
  });
  assert.match(text(markup), /View changes against origin\/main/);
  assert.doesNotMatch(markup, /refs\/remotes/);
});

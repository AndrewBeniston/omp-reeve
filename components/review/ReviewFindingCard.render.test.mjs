import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { ReviewFindingCard } = await jiti.import("./ReviewFindingCard.tsx");

const words = (markup) => markup.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

const finding = (extra = {}) => ({
  id: "a1#0", entryId: "a1", directiveIndex: 0, path: "src/total.js", side: "additions",
  startLine: 3, endLine: 3, title: "Off-by-one", body: "The loop reads past the end.",
  priority: "0", model: "live-fixture/test-model", requestId: "r1", createdAt: "now", ...extra,
});

const render = (placed, options = {}) => renderToStaticMarkup(React.createElement(ReviewFindingCard, {
  placed, dismissed: false, canAddToChat: true,
  onDismiss: () => {}, onRestore: () => {}, onAddToChat: () => {}, ...options,
}));

test("a finding says which model wrote it, and what it says", () => {
  const markup = render({ finding: finding(), placement: { state: "anchored", startLine: 3, endLine: 3 } });
  assert.match(words(markup), /Line 3/);
  assert.match(words(markup), /Written by live-fixture\/test-model/);
  assert.match(words(markup), /Off-by-one/);
  assert.match(words(markup), /The loop reads past the end\./);
  assert.match(words(markup), /Priority 0/);
});

test("the model's words cannot be edited or deleted here", () => {
  const markup = render({ finding: finding(), placement: { state: "anchored", startLine: 3, endLine: 3 } });
  assert.doesNotMatch(markup, /<textarea|<input/, "a read-only finding offered a way to write over it");
  assert.doesNotMatch(words(markup), /Remove|Delete|Edit/, "a finding offered an act that belongs to a comment");
  assert.match(words(markup), /Dismiss/);
});

test("dismissing is reversible, and the card says so", () => {
  const markup = render({ finding: finding(), placement: { state: "anchored", startLine: 3, endLine: 3 } }, { dismissed: true });
  assert.match(words(markup), /Dismissed/);
  assert.match(words(markup), /Show again/);
  assert.doesNotMatch(words(markup), /Dismiss\b(?! )/);
});

test("a finding on no line says why, rather than naming one", () => {
  const markup = render({ finding: finding(), placement: { state: "unplaced", reason: "revision-changed" } });
  assert.match(words(markup), /This file changed after the review ran/);
});

test("a finding about the whole file names the file rather than a line", () => {
  const markup = render({
    finding: finding({ startLine: undefined, endLine: undefined }),
    placement: { state: "unplaced", reason: "file-level" },
  });
  assert.match(words(markup), /This file/);
  assert.match(words(markup), /about the file rather than a line/);
});

test("a finding that followed its lines says it moved", () => {
  const markup = render({ finding: finding(), placement: { state: "moved", startLine: 9, endLine: 9 } });
  assert.match(words(markup), /Line 9/);
  assert.match(words(markup), /Moved/);
});

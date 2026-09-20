import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { ReviewPrThreadCard } = await jiti.import("./ReviewPrThreadCard.tsx");

const words = (markup) => markup.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const render = (thread) => renderToStaticMarkup(React.createElement(ReviewPrThreadCard, { thread }));
const thread = (extra = {}) => ({ id: "T1", path: "src/a.ts", startLine: 12, endLine: 12, side: "additions",
  resolved: false, outdated: false, canReply: true, canResolve: true,
  comments: [{ id: "C1", author: "fixture-author", body: "Already on GitHub.", createdAt: "now", url: "u", canEdit: false, canDelete: false }], ...extra });

test("a published thread is drawn where it was left, and says it is already public", () => {
  const markup = render(thread());
  assert.match(words(markup), /Line 12 \(new\)/);
  assert.match(words(markup), /fixture-author/);
  assert.match(words(markup), /Already on GitHub\./);
  assert.match(words(markup), /Published on GitHub/);
});

test("nothing here can change the thread", () => {
  const markup = render(thread());
  assert.doesNotMatch(markup, /<button|<textarea|<input/, "a read-only thread offered a way to write to it");
});

test("a resolved or outdated thread says so", () => {
  const markup = render(thread({ resolved: true, outdated: true }));
  assert.match(words(markup), /Resolved/);
  assert.match(words(markup), /Outdated/);
});

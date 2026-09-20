/**
 * The findings no diff on screen is drawing.
 *
 * The rule this asserts is that none of them is ever hidden. A finding Reeve
 * cannot place, and a finding whose file this view is not drawing, both stay
 * on screen, named by their file, with the same two acts every other finding
 * offers.
 */
import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { ReviewOrphanFindings } = await jiti.import("./ReviewOrphanFindings.tsx");

const words = (markup) => markup.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

const finding = (extra = {}) => ({
  id: "a1#0", entryId: "a1", directiveIndex: 0, path: "lib/gone.ts", side: "additions",
  startLine: 4, endLine: 4, title: "Off-by-one", body: "The loop reads past the end.",
  model: "test/model", requestId: "r1", createdAt: "now", ...extra,
});

const render = (entries, handling = {}) => renderToStaticMarkup(React.createElement(ReviewOrphanFindings, {
  entries,
  handling: {
    findings: entries,
    isFindingDismissed: () => false,
    onDismissFinding() {},
    onRestoreFinding() {},
    onAddFindingToChat() {},
    ...handling,
  },
}));

test("a finding on no line is kept, and named by its file", () => {
  const markup = render([{ finding: finding(), placement: { state: "unplaced", reason: "outside-review" } }]);
  assert.match(words(markup), /lib\/gone\.ts/);
  assert.match(words(markup), /Off-by-one/);
  assert.match(words(markup), /names a file the review on screen is not showing/);
  assert.match(words(markup), /Written by test\/model/);
});

test("every finding given to it is drawn, and none is dropped", () => {
  const entries = [
    { finding: finding(), placement: { state: "unplaced", reason: "file-level" } },
    { finding: finding({ id: "a2#0", path: "lib/other.ts" }), placement: { state: "detached", reason: "gone" } },
  ];
  const markup = render(entries);
  assert.match(words(markup), /2 findings from the review are not on any diff here/);
  assert.match(words(markup), /lib\/gone\.ts/);
  assert.match(words(markup), /lib\/other\.ts/);
});

test("a dismissed finding shown again says so, and offers to come back", () => {
  const markup = render(
    [{ finding: finding(), placement: { state: "unplaced", reason: "file-level" } }],
    { isFindingDismissed: () => true },
  );
  assert.match(words(markup), /Dismissed/);
  assert.match(words(markup), /Show again/);
});

test("without a Session to hand a finding to, nothing offers to", () => {
  const markup = render(
    [{ finding: finding(), placement: { state: "unplaced", reason: "file-level" } }],
    { onAddFindingToChat: undefined },
  );
  assert.doesNotMatch(words(markup), /Add to chat/);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  chooseReviewScrollAnchor,
  resolveReviewScrollTop,
  reviewScrollRestoreStep,
  sanitizeReviewScrollAnchor,
} from "./review-scroll-anchor.ts";
import { sanitizeReviewSelection } from "./review-selection.ts";

const sections = [
  { path: "config/eslint.config.mjs", top: 0 },
  { path: "lib/review/helper-1.ts", top: 400 },
  { path: "lib/review/helper-2.ts", top: 900 },
  { path: "src/App.tsx", top: 3200 },
];

test("the anchor names the file the viewport is resting in", () => {
  const anchor = chooseReviewScrollAnchor({ owner: "owner-a", scrollTop: 1100, sections });
  assert.deepEqual(anchor, { owner: "owner-a", path: "lib/review/helper-2.ts", offset: 200 });
});

test("a reading at the top of the list keeps no anchor", () => {
  assert.equal(chooseReviewScrollAnchor({ owner: "owner-a", scrollTop: 0, sections }), null);
});

test("an anchor returns the reader to the same place in the same file", () => {
  const anchor = { owner: "owner-a", path: "lib/review/helper-2.ts", offset: 200 };
  assert.equal(resolveReviewScrollTop({ anchor, owner: "owner-a", sections }), 1100);
});

test("a scope that draws the file at another height still returns to the file", () => {
  const anchor = { owner: "owner-a", path: "lib/review/helper-2.ts", offset: 200 };
  const moved = [{ path: "lib/review/helper-2.ts", top: 60 }];
  assert.equal(resolveReviewScrollTop({ anchor, owner: "owner-a", sections: moved }), 260);
});

test("an anchor from another Session never moves this list", () => {
  const anchor = { owner: "owner-a", path: "lib/review/helper-2.ts", offset: 200 };
  assert.equal(resolveReviewScrollTop({ anchor, owner: "owner-b", sections }), null);
});

test("a scope without that file starts at the top rather than guessing", () => {
  const anchor = { owner: "owner-a", path: "docs/gone.md", offset: 200 };
  assert.equal(resolveReviewScrollTop({ anchor, owner: "owner-a", sections }), null);
});

test("a restored scroll position is never negative", () => {
  const anchor = { owner: "owner-a", path: "lib/review/helper-1.ts", offset: -900 };
  assert.equal(resolveReviewScrollTop({ anchor, owner: "owner-a", sections }), 0);
});

test("an edited selection file cannot restore a reading to an arbitrary place", () => {
  assert.equal(sanitizeReviewScrollAnchor({ owner: "owner-a", path: "a.ts", offset: "200" }), null);
  assert.equal(sanitizeReviewScrollAnchor({ owner: "owner-a", path: "a.ts", offset: Number.NaN }), null);
  assert.equal(sanitizeReviewScrollAnchor({ owner: "", path: "a.ts", offset: 1 }), null);
  assert.equal(sanitizeReviewScrollAnchor({ path: "a.ts", offset: 1 }), null);
  assert.equal(sanitizeReviewScrollAnchor(null), null);
  assert.equal(sanitizeReviewScrollAnchor([{ owner: "owner-a", path: "a.ts", offset: 1 }]), null);
});

test("a stored Tab carries its anchor back", () => {
  const selection = sanitizeReviewSelection({
    kind: "uncommitted",
    fileView: { filter: "", showFiles: true, selectedPath: "src/App.tsx", scrollAnchor: { owner: "owner-a", path: "lib/review/helper-2.ts", offset: 200 } },
  });
  assert.deepEqual(selection?.fileView?.scrollAnchor, { owner: "owner-a", path: "lib/review/helper-2.ts", offset: 200 });
});

test("a Tab stored before the anchor existed restores without one", () => {
  const selection = sanitizeReviewSelection({
    kind: "uncommitted",
    fileView: { filter: "", showFiles: true, selectedPath: "src/App.tsx" },
  });
  assert.equal(selection?.fileView?.scrollAnchor, null);
  assert.equal(selection?.fileView?.selectedPath, "src/App.tsx");
});


const OWNER = "session-a::/repo";
const ANCHOR = { owner: OWNER, path: "lib/review/helper-2.ts", offset: 200 };
const READY = [{ path: "lib/review/helper-2.ts", top: 900 }];
const step = (over) => reviewScrollRestoreStep({
  anchor: ANCHOR, owner: OWNER, sections: READY, reachable: 100000, budgetSpent: false, ...over,
});

test("a list with no sections yet is waited for, not given up on", () => {
  assert.deepEqual(step({ sections: [] }), { action: "wait" });
});

test("a list that draws this file late is waited for", () => {
  assert.deepEqual(step({ sections: [{ path: "src/App.tsx", top: 0 }] }), { action: "wait" });
});

test("the wait ends when the budget is spent and the file never arrived", () => {
  assert.deepEqual(step({ sections: [], budgetSpent: true }), { action: "stop" });
  assert.deepEqual(step({ sections: [{ path: "src/App.tsx", top: 0 }], budgetSpent: true }), { action: "stop" });
});

test("a container still shorter than the target is waited for", () => {
  assert.deepEqual(step({ reachable: 10 }), { action: "wait" });
});

test("a container tall enough is scrolled to the anchor", () => {
  assert.deepEqual(step({ reachable: 1100 }), { action: "scroll", top: 1100 });
});

test("a short container is scrolled anyway once the budget is spent", () => {
  assert.deepEqual(step({ reachable: 10, budgetSpent: true }), { action: "scroll", top: 1100 });
});

test("an anchor from another Session stops at once, because no frame can help", () => {
  assert.deepEqual(step({ owner: "session-b::/repo" }), { action: "stop" });
  assert.deepEqual(step({ anchor: null }), { action: "stop" });
});

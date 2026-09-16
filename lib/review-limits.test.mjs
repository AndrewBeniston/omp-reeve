import assert from "node:assert/strict";
import test from "node:test";
import { describeOversizedReviewFile, isOversizedReviewFile, requiresSingleFileReview, reviewFileMeasuredLength } from "./review-limits.ts";

test("large Review thresholds match the reference boundaries", () => {
  const boundary = { fileCount: 128, changedLines: 9000, diffBytes: 12 * 1024 * 1024 };
  assert.equal(requiresSingleFileReview(boundary), false);
  for (const key of Object.keys(boundary)) {
    assert.equal(requiresSingleFileReview({ ...boundary, [key]: boundary[key] + 1 }), true, key);
  }
});

test("oversized file fallback ignores context and checks each changed-text limit", () => {
  const file = (additionLines, count = additionLines.length) => ({
    additionLines: ["context".repeat(200000), ...additionLines], deletionLines: [],
    hunks: [{ additionLines: count, deletionLines: 0, hunkContent: [
      { type: "context", lines: 1, additionLineIndex: 0, deletionLineIndex: 0 },
      { type: "change", additions: count, deletions: 0, additionLineIndex: 1, deletionLineIndex: 0 },
    ] }],
  });
  assert.equal(isOversizedReviewFile(file(["small change"])), false);
  assert.equal(isOversizedReviewFile(file(Array(15000).fill("x"))), false);
  assert.equal(isOversizedReviewFile(file(Array(15001).fill("x"))), true);
  assert.equal(isOversizedReviewFile(file(["x".repeat(1024 * 1024)])), false);
  assert.equal(isOversizedReviewFile(file(["x".repeat(1024 * 1024 + 1)])), true);
  assert.equal(isOversizedReviewFile(file(Array(3).fill("x".repeat(1024 * 1024)))), false);
  assert.equal(isOversizedReviewFile(file([...Array(3).fill("x".repeat(1024 * 1024)), "x"])), true);
});

test("changed text is measured the way the reference measures it, in UTF-16 units", () => {
  // The reference measures in UTF-16 code units, so a character outside the
  // basic plane counts 2 and a three-byte character counts 1. Counting UTF-8
  // bytes here would withhold files the reference renders.
  assert.equal(reviewFileMeasuredLength("é"), 1);
  assert.equal(reviewFileMeasuredLength("→"), 1);
  assert.equal(reviewFileMeasuredLength("😀"), 2);
  assert.equal(reviewFileMeasuredLength(undefined), 0);
  // A line of three-byte characters sits under the per-line limit at this
  // measure and would sit over it if bytes were counted.
  const wide = { additionLines: ["→".repeat(1024 * 1024 - 1)], deletionLines: [],
    hunks: [{ additionLines: 1, deletionLines: 0, hunkContent: [
      { type: "change", additions: 1, deletions: 0, additionLineIndex: 0, deletionLineIndex: 0 },
    ] }] };
  assert.equal(describeOversizedReviewFile(wide), null);
});

test("a withheld file names which limit held it back, so the panel can say so", () => {
  const file = (additionLines, count = additionLines.length) => ({
    additionLines: ["context".repeat(200000), ...additionLines], deletionLines: [],
    hunks: [{ additionLines: count, deletionLines: 0, hunkContent: [
      { type: "context", lines: 1, additionLineIndex: 0, deletionLineIndex: 0 },
      { type: "change", additions: count, deletions: 0, additionLineIndex: 1, deletionLineIndex: 0 },
    ] }],
  });
  assert.equal(describeOversizedReviewFile(file(["small change"])), null);
  assert.equal(describeOversizedReviewFile(file(Array(15001).fill("x"))).limit, "changedLines");
  assert.equal(describeOversizedReviewFile(file(["x".repeat(1024 * 1024 + 1)])).limit, "lineBytes");
  assert.equal(describeOversizedReviewFile(file([...Array(3).fill("x".repeat(1024 * 1024)), "x"])).limit, "changedBytes");
});

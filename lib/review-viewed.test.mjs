import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { isReviewFileViewed, reviewViewedCount } = await jiti.import("./review-viewed.ts");

test("a mark is the revision it was made against", () => {
  const viewed = { "lib/a.ts": "rev-1" };
  assert.equal(isReviewFileViewed(viewed, "lib/a.ts", "rev-1"), true);
  // The file changed underneath the mark, so it is unviewed again.
  assert.equal(isReviewFileViewed(viewed, "lib/a.ts", "rev-2"), false);
  assert.equal(isReviewFileViewed(viewed, "lib/b.ts", "rev-1"), false);
});

test("nothing recorded, and nothing to compare against, are both unviewed", () => {
  assert.equal(isReviewFileViewed(undefined, "lib/a.ts", "rev-1"), false);
  assert.equal(isReviewFileViewed({ "lib/a.ts": "rev-1" }, "lib/a.ts", undefined), false);
});

test("the count is of the files on screen, at the revisions on screen", () => {
  const viewed = { "lib/a.ts": "rev-1", "lib/b.ts": "old", "gone.ts": "rev-9" };
  const revisions = { "lib/a.ts": "rev-1", "lib/b.ts": "rev-2", "lib/c.ts": "rev-3" };
  assert.equal(reviewViewedCount(viewed, revisions, ["lib/a.ts", "lib/b.ts", "lib/c.ts"]), 1);
});

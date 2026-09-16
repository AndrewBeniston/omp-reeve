import assert from "node:assert/strict";
import test from "node:test";
import { reviewOutcomeMessage } from "./review-outcome.ts";

test("an outcome says which operation ran, on what, and how far it got", () => {
  assert.deepEqual(reviewOutcomeMessage({ operation: "stage", targetKind: "file", status: "success", path: "file.txt" }),
    { tone: "success", message: "Staged file.txt" });
  assert.deepEqual(reviewOutcomeMessage({ operation: "revert", targetKind: "hunk", status: "success", path: "file.txt", hunkNumber: 2 }),
    { tone: "success", message: "Reverted hunk 2 in file.txt" });
  assert.deepEqual(reviewOutcomeMessage({ operation: "unstage", targetKind: "section", status: "success" }),
    { tone: "success", message: "Section unstaged" });
});

test("a partial result never reads as a success, and a failure never reads as partial", () => {
  assert.deepEqual(reviewOutcomeMessage({ operation: "revert", targetKind: "section", status: "partial" }),
    { tone: "warning", message: "Section partially reverted" });
  assert.deepEqual(reviewOutcomeMessage({ operation: "stage", targetKind: "file", status: "partial", path: "a.txt" }),
    { tone: "warning", message: "Partially staged a.txt" });
  assert.deepEqual(reviewOutcomeMessage({ operation: "revert", targetKind: "hunk", status: "error", path: "a.txt", hunkNumber: 3 }),
    { tone: "danger", message: "Failed to revert hunk 3 in a.txt" });
  assert.deepEqual(reviewOutcomeMessage({ operation: "stage", targetKind: "section", status: "error" }),
    { tone: "danger", message: "Failed to stage section" });
});

test("a stale refusal says nothing was applied, whatever it was asked to do", () => {
  for (const operation of ["stage", "unstage", "revert"]) {
    const outcome = reviewOutcomeMessage({ operation, targetKind: "file", status: "stale", path: "a.txt" });
    assert.equal(outcome.tone, "warning");
    assert.match(outcome.message, /nothing was applied/);
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { addPastedTextAttachment } from "./composer-attachment-state.ts";

// Regression for #575 finding 1: the new pasted item is the last element,
// and earlier attachments are kept once.
test("a long paste is appended after existing attachments", () => {
  const existing = [{ id: 1, name: "c.txt", kind: "file", pathSummary: "", readError: null }];
  const next = addPastedTextAttachment(existing, "x".repeat(6000));
  assert.equal(next.length, 2);
  assert.equal(next[0].name, "c.txt");
  assert.equal(next[1].pastedText?.length, 6000);
  assert.notEqual(next[1].id, next[0].id);
});

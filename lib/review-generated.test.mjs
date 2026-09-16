import assert from "node:assert/strict";
import test from "node:test";
import { generatedPathsFromAttributes, isGeneratedAttributeValue, partitionGeneratedReviewFiles } from "./review-generated.ts";

/** One `git check-attr -z --stdin` answer, as that command spells it. */
const attributes = (pairs) => pairs.map(([path, value]) => `${path}\0linguist-generated\0${value}\0`).join("");

test("the attribute values the reference reads as generated, and the ones it does not", () => {
  assert.equal(isGeneratedAttributeValue("set"), true);
  assert.equal(isGeneratedAttributeValue("true"), true);
  for (const value of ["unset", "false", "unspecified", "TRUE", "True", "yes", "1", ""]) {
    assert.equal(isGeneratedAttributeValue(value), false, value);
  }
});

test("only the generated paths come back, and the rest stay shown", () => {
  const output = attributes([
    ["bare.txt", "set"],
    ["true.txt", "true"],
    ["false.txt", "false"],
    ["unset.txt", "unset"],
    ["plain.txt", "unspecified"],
    ["shouty.txt", "TRUE"],
  ]);
  assert.deepEqual(generatedPathsFromAttributes(output), ["bare.txt", "true.txt"]);
  assert.deepEqual(generatedPathsFromAttributes(""), []);
});

test("a path holding the separator does not shift the triples that follow it", () => {
  const output = attributes([["odd name.txt", "set"], ["next.txt", "true"]]);
  assert.deepEqual(generatedPathsFromAttributes(output), ["odd name.txt", "next.txt"]);
});

test("the filter holds nothing until it is turned on, and the reveal is turning it off", () => {
  const files = [{ path: "src/index.ts" }, { path: "bun.lock" }, { path: "docs/api.md" }];
  const generated = ["bun.lock"];

  const shown = partitionGeneratedReviewFiles(files, generated, false);
  assert.deepEqual(shown.visible.map((file) => file.path), ["src/index.ts", "bun.lock", "docs/api.md"]);
  assert.deepEqual(shown.hidden, []);

  const filtered = partitionGeneratedReviewFiles(files, generated, true);
  assert.deepEqual(filtered.visible.map((file) => file.path), ["src/index.ts", "docs/api.md"]);
  assert.deepEqual(filtered.hidden.map((file) => file.path), ["bun.lock"]);
});

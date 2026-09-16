import assert from "node:assert/strict";
import test from "node:test";
import { parseReviewFindingDirectives } from "./review-finding-directive.ts";

const WELL_FORMED = '::code-comment{title="Off-by-one" body="The loop reads past the end." file="lib/a.ts" start=10 end=11 priority=2}';

test("a well-formed directive gives every field", () => {
  const [directive] = parseReviewFindingDirectives(`Here is what I found.\n\n${WELL_FORMED}\n`);
  assert.deepEqual(directive, {
    index: 0,
    title: "Off-by-one",
    body: "The loop reads past the end.",
    file: "lib/a.ts",
    start: 10,
    end: 11,
    priority: "2",
  });
});

test("text with no directive gives nothing", () => {
  assert.deepEqual(parseReviewFindingDirectives("A review that raises nothing on a line."), []);
});

test("a directive missing a required field is refused, and still takes its number", () => {
  const text = [
    '::code-comment{title="No body" file="lib/a.ts" start=3}',
    WELL_FORMED,
  ].join("\n");
  const directives = parseReviewFindingDirectives(text);
  assert.equal(directives.length, 1);
  assert.equal(directives[0].index, 1);
});

test("an unterminated quotation refuses the whole directive", () => {
  const text = '::code-comment{title="Open body="never closed" file="lib/a.ts}';
  assert.deepEqual(parseReviewFindingDirectives(text), []);
});

test("a directive inside a fence, a quotation or an indented block is text about a directive", () => {
  const text = [
    "```md",
    WELL_FORMED,
    "```",
    `> ${WELL_FORMED}`,
    `    ${WELL_FORMED}`,
    `\`${WELL_FORMED}\``,
  ].join("\n");
  assert.deepEqual(parseReviewFindingDirectives(text), []);
});

test("an end below its start leaves the start standing alone", () => {
  const [directive] = parseReviewFindingDirectives('::code-comment{title="T" body="B" file="a.ts" start=9 end=4}');
  assert.equal(directive.start, 9);
  assert.equal(directive.end, undefined);
});

test("an escaped quotation and a newline survive the body", () => {
  const [directive] = parseReviewFindingDirectives('::code-comment{title="T" body="Call \\"run\\" first.\\nThen check it." file="a.ts"}');
  assert.equal(directive.body, 'Call "run" first.\nThen check it.');
});

import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const {
  createStreamingMarkdownKeyState,
  reconcileStreamingSegmentKeys,
  segmentStreamingText,
  stabilizeStreamingMarkdown,
} = await jiti.import("./streaming-markdown.ts");

test("segments ASCII prose like Codex", () => {
  assert.deepEqual(
    segmentStreamingText("Hello, smooth world!"),
    ["Hello, ", "smooth ", "world!"],
  );
});

test("keeps a stable key while a streamed word grows", () => {
  const initial = reconcileStreamingSegmentKeys(
    ["Hel"],
    createStreamingMarkdownKeyState(),
  );
  const next = reconcileStreamingSegmentKeys(["Hello "], initial.nextState);

  assert.deepEqual(next.keys, initial.keys);
});

test("keeps equal segment keys when Markdown reparsing moves them", () => {
  const initial = reconcileStreamingSegmentKeys(
    ["Alpha ", "Beta"],
    createStreamingMarkdownKeyState(),
  );
  const next = reconcileStreamingSegmentKeys(["Beta", "Alpha "], initial.nextState);

  assert.deepEqual(next.keys, [initial.keys[1], initial.keys[0]]);
});

test("assigns a new key only to new streamed content", () => {
  const initial = reconcileStreamingSegmentKeys(
    ["Hello "],
    createStreamingMarkdownKeyState(),
  );
  const next = reconcileStreamingSegmentKeys(["Hello ", "world"], initial.nextState);

  assert.equal(next.keys[0], initial.keys[0]);
  assert.notEqual(next.keys[1], initial.keys[0]);
});

test("stabilizes unfinished emphasis without changing completed Markdown", () => {
  assert.equal(stabilizeStreamingMarkdown("A **bold answer"), "A **bold answer**");
  assert.equal(stabilizeStreamingMarkdown("A **bold answer**"), "A **bold answer**");
  assert.equal(stabilizeStreamingMarkdown("A *small answer"), "A *small answer*");
});

test("shows incomplete links as labels and hides incomplete image tails", () => {
  assert.equal(stabilizeStreamingMarkdown("Read [the guide](https://example.com"), "Read the guide");
  assert.equal(stabilizeStreamingMarkdown("Before\n\n![loading](https://example.com"), "Before\n\n");
  assert.equal(
    stabilizeStreamingMarkdown("Read [the guide](https://example.com)"),
    "Read [the guide](https://example.com)",
  );
});

test("leaves open code spans and fences untouched", () => {
  assert.equal(stabilizeStreamingMarkdown("Use `bun te"), "Use `bun te");
  assert.equal(stabilizeStreamingMarkdown("```ts\nconst value = 1"), "```ts\nconst value = 1");
});

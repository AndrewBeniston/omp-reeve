import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const { collectSessionSummarySources } = await createJiti(import.meta.url, {
  moduleCache: false,
  tryNative: false,
}).import("./session-summary.ts");

test("collects explicit image, file, and web sources without duplicates", () => {
  const messages = [
    {
      role: "user",
      content: [
        { type: "text", text: "Use https://example.com/reference for this." },
        { type: "image", source: { type: "base64", media_type: "image/png", data: "aGVsbG8=" } },
      ],
    },
    {
      role: "assistant",
      content: [
        { type: "toolCall", toolCallId: "read-1", toolName: "read", input: { path: "docs/guide.md" } },
        { type: "toolCall", toolCallId: "browser-1", toolName: "browser", input: { url: "https://example.com/reference" } },
      ],
      model: "fixture",
      provider: "fixture",
    },
  ];

  assert.deepEqual(collectSessionSummarySources(messages, "/tmp/project"), [
    {
      activity: "provided",
      id: "url:https://example.com/reference",
      kind: "url",
      label: "example.com",
      url: "https://example.com/reference",
    },
    {
      activity: "attached",
      id: "image:1:8:aGVsbG8=",
      kind: "image",
      label: "Image 1",
      url: "data:image/png;base64,aGVsbG8=",
    },
    {
      activity: "read",
      id: "file:/tmp/project/docs/guide.md",
      kind: "file",
      label: "guide.md",
      path: "/tmp/project/docs/guide.md",
    },
  ]);
});

test("ignores generated assistant images and unsafe URLs", () => {
  const messages = [
    { role: "user", content: "javascript:alert(1)" },
    {
      role: "assistant",
      content: [{ type: "image", source: { type: "url", url: "https://example.com/generated.png" } }],
      model: "fixture",
      provider: "fixture",
    },
  ];

  assert.deepEqual(collectSessionSummarySources(messages, "/tmp/project"), []);
});

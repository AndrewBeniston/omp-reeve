import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const {
  buildTranscriptNavigationItems,
  resolveTranscriptPreviewIntent,
  visibleTranscriptTurnIds,
} = await jiti.import("./TranscriptNavigationRail.tsx");

test("highlights every visible turn including a response whose request is above the viewport", () => {
  const turns = [0, 100, 200, 300, 400].map((top, index) => ({ id: String(index), top }));
  assert.deepEqual(visibleTranscriptTurnIds(turns, { top: 50, bottom: 350 }, 600), ["0", "1", "2", "3"]);
  assert.deepEqual(visibleTranscriptTurnIds(turns, { top: 100, bottom: 200 }, 600), ["1"]);
  assert.deepEqual(visibleTranscriptTurnIds(turns, { top: 450, bottom: 550 }, 600), ["4"]);
  assert.deepEqual(visibleTranscriptTurnIds(turns, { top: 600, bottom: 700 }, 600), []);
  assert.deepEqual(visibleTranscriptTurnIds([], { top: 0, bottom: 100 }, 100), []);
});

test("builds one navigation item for each saved user message and its following response", () => {
  const messages = [
    { role: "user", content: "First request" },
    { role: "assistant", content: [{ type: "text", text: "First response" }] },
    { role: "assistant", content: [{ type: "text", text: "Final first response" }] },
    { role: "user", content: [{ type: "text", text: "Second request" }] },
    { role: "assistant", content: [{ type: "text", text: "Second response" }] },
  ];
  const items = buildTranscriptNavigationItems(messages, ["u1", "a1", "a2", "u2", "a3"]);

  assert.deepEqual(items, [
    { id: "u1", label: "First request", response: "Final first response" },
    { id: "u2", label: "Second request", response: "Second response" },
  ]);
});

test("retargets the delayed preview and switches an open preview immediately", () => {
  assert.equal(resolveTranscriptPreviewIntent(null, false, "first"), "schedule");
  assert.equal(resolveTranscriptPreviewIntent(null, true, "second"), "retarget");
  assert.equal(resolveTranscriptPreviewIntent("first", false, "second"), "show");
  assert.equal(resolveTranscriptPreviewIntent("second", false, "second"), "keep");
});

test("matches the measured Codex rail, marker, preview, and interaction contracts", async () => {
  const [source, sheet, chat, turn] = await Promise.all([
    readFile(new URL("./TranscriptNavigationRail.tsx", import.meta.url), "utf8"),
    readFile(new URL("./transcript-navigation-rail.module.css", import.meta.url), "utf8"),
    readFile(new URL("../ChatWindow.tsx", import.meta.url), "utf8"),
    readFile(new URL("./MessageTurn.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(source, /items\.length < 4/);
  assert.match(source, /setTimeout\([\s\S]*?, 150\)/);
  assert.match(source, /onReveal\(item, "smooth"\)/);
  assert.match(source, /onReveal\(item, "instant"\)/);
  assert.match(sheet, /\.rail\s*\{[^}]*top:\s*50%;[^}]*left:\s*16px/s);
  assert.match(sheet, /\.list\s*\{[^}]*max-height:\s*min\(70vh, 640px\)/s);
  assert.match(sheet, /\.item\s*\{[^}]*width:\s*36px;[^}]*height:\s*10px/s);
  assert.match(sheet, /\.marker\s*\{[^}]*width:\s*26px;[^}]*height:\s*2px/s);
  assert.match(sheet, /\.tooltip\s*\{[^}]*width:\s*320px;[^}]*border-radius:\s*12px/s);
  assert.match(sheet, /\.item:hover \.markerLine[\s\S]*?--marker-progress:\s*1/);
  assert.match(
    sheet,
    /\.list:has\(\.item\[data-scrub-target="true"\]\)[\s\S]*?\.item\[data-current="true"\]:not\(\[data-scrub-target="true"\]\)/,
  );
  assert.match(
    sheet,
    /\.list:not\(\[data-scrubbing="true"\]\):not\(:has\(\.item\[data-scrub-target="true"\]\)\):hover[\s\S]*?\.item\[data-current="true"\]:not\(:hover\):not\(:focus-visible\)/,
  );
  assert.match(chat, /<TranscriptNavigationRail/);
  assert.match(chat, /data-transcript-navigation-content/);
  assert.match(turn, /data-transcript-navigation-id=\{navigationId\}/);
});

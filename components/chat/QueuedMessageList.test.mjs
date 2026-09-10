import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const { QueuedMessageList, reorderQueuedMessageIds } = await jiti.import("./QueuedMessageList.tsx");

const items = [
  { id: "one", kind: "followUp", text: "First queued message", imageCount: 0 },
  { id: "two", kind: "followUp", text: "Second queued message", imageCount: 0 },
];

test("renders the Codex queue row actions and queue mode action", () => {
  const html = renderToStaticMarkup(React.createElement(QueuedMessageList, {
    items,
    paused: false,
    queueingEnabled: true,
    onDelete() {},
    onEdit() {},
    onReorder() {},
    onSendNow() {},
    onQueueingChange() {},
    onResume() {},
  }));

  assert.match(html, /role="list"[^>]+aria-label="2 queued messages"/);
  assert.match(html, /First queued message/);
  assert.match(html, /aria-label="Steer queued message"/);
  assert.match(html, /aria-label="Delete queued message"/);
  assert.match(html, /aria-label="Queued message actions"/);
  assert.match(html, /Edit message/);
  assert.match(html, /Turn off queueing/);
  assert.match(html, /<svg[^>]+width="6"[^>]+height="10"/);
});

test("renders the interrupted queue header without changing message actions", () => {
  const html = renderToStaticMarkup(React.createElement(QueuedMessageList, {
    items,
    paused: true,
    queueingEnabled: true,
    onDelete() {},
    onEdit() {},
    onReorder() {},
    onSendNow() {},
    onQueueingChange() {},
    onResume() {},
  }));

  assert.match(html, /Queue paused because you interrupted/);
  assert.match(html, /Resume</);
  assert.match(html, /data-queue-status-icon="pause"/);
  assert.match(html, /data-queue-status-icon="play"/);
  assert.match(html, /data-queue-status-icon="pause"[^>]+width="14"[^>]+height="14"/);
  assert.match(html, /data-queue-status-icon="play"[^>]+width="14"[^>]+height="14"/);
  assert.match(html, /aria-label="Steer queued message"/);
  assert.doesNotMatch(html, /Retry queued message|This queued message could not be sent/);
});

test("reorders queue identifiers around the drop target", () => {
  assert.deepEqual(reorderQueuedMessageIds(["one", "two", "three"], "one", "three"), ["two", "three", "one"]);
  assert.deepEqual(reorderQueuedMessageIds(["one", "two"], "missing", "two"), ["one", "two"]);
});

test("uses Codex-style live sortable motion instead of native drop-only dragging", async () => {
  const source = await readFile(new URL("./QueuedMessageList.tsx", import.meta.url), "utf8");

  assert.match(source, /from "@dnd-kit\/core"/);
  assert.match(source, /DragOverlay/);
  assert.match(source, /from "@dnd-kit\/sortable"/);
  assert.match(source, /from "@dnd-kit\/modifiers"/);
  assert.match(source, /activationConstraint:\s*\{ distance: 6 \}/);
  assert.match(source, /const \[activeId, setActiveId\] = useState<string \| null>\(null\)/);
  assert.match(source, /useSortable\(/);
  assert.match(source, /transform,\s*transition,\s*isDragging/);
  assert.match(source, /<SortableContext[^>]+strategy=\{verticalListSortingStrategy\}/);
  assert.match(source, /modifiers=\{\[restrictToVerticalAxis, restrictToParentElement\]\}/);
  assert.match(source, /onDragStart=\{\(\{ active \}\) => setActiveId\(String\(active\.id\)\)\}/);
  assert.match(source, /onDragCancel=\{\(\) => setActiveId\(null\)\}/);
  assert.match(source, /<DragOverlay[^>]+dropAnimation=\{QUEUE_DROP_ANIMATION\}/);
  assert.match(source, /"--ui-queue-translate-x"/);
  assert.match(source, /"--ui-queue-translate-y"/);
  assert.match(source, /"--ui-queue-transition": transition \?\? "none"/);
  assert.match(source, /<DynamicStyleVars[\s\S]*?elementRef=\{setNodeRef\}[\s\S]*?role="listitem"/);
  assert.doesNotMatch(source, /className=\{styles\.sortableGeometry\}/);
  assert.doesNotMatch(source, /draggable=\{items|onDragOver=|onDrop=/);
});

test("uses the measured Codex queue geometry and prevents horizontal scrolling", async () => {
  const css = await readFile(new URL("./queued-message-list.module.css", import.meta.url), "utf8");

  assert.match(css, /\.tray\s*\{[^}]*overflow-x:\s*hidden;/);
  assert.match(css, /\.tray\s*\{[^}]*border-bottom:\s*0;/);
  assert.match(css, /\.tray\s*\{[^}]*border-radius:\s*16px 16px 0 0;/);
  assert.match(css, /\.tray\s*\{[^}]*border:\s*1px solid color-mix\(in srgb, var\(--ui-text\) 12%, transparent\);/);
  assert.match(css, /\.tray\s*\{[^}]*background:\s*color-mix\(in srgb, var\(--ui-composer\) 92%, var\(--ui-main\)\);/);
  assert.match(css, /\.list\s*\{[^}]*gap:\s*1px;/);
  assert.match(css, /\.row\s*\{[^}]*min-height:\s*32px;/);
  assert.match(css, /\.row\s*\{[^}]*gap:\s*8px;[^}]*padding:\s*2px 10px;/);
  assert.match(css, /\.row\s*\{[^}]*background:\s*transparent;/);
  assert.match(css, /\.row\s*\{[^}]*transition:\s*var\(--ui-queue-transition\);/);
  assert.doesNotMatch(css, /\.row\s*\{[^}]*opacity 180ms/);
  assert.match(css, /@supports\s*\(corner-shape:\s*superellipse\(1\.5\)\)\s*\{[\s\S]*?\.tray\s*\{[^}]*border-radius:\s*20px 20px 0 0;/);
  assert.match(css, /\.pausedHeader\s*\{[^}]*min-height:\s*32px;[^}]*padding:\s*2px 10px;/);
  assert.match(css, /\.pausedTitle\s*\{[^}]*gap:\s*8px;/);
  assert.match(css, /\.dragHandle\s*\{[^}]*height:\s*16px;[^}]*margin-inline-start:\s*-10px;[^}]*padding:\s*0 0 0 10px;/);
  assert.doesNotMatch(css, /\.dragHandle:hover/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const { parseComposerValue, serializeComposerDocument } = await jiti.import("./ComposerEditor.tsx");
const editorCss = readFileSync(new URL("./composer-editor.module.css", import.meta.url), "utf8");
const editorSource = readFileSync(new URL("./ComposerEditor.tsx", import.meta.url), "utf8");

const mentions = [
  { kind: "skill", label: "Codebase Design", raw: "/skill:codebase-design", detail: "Design modules" },
  { kind: "file", label: "ChatInput.tsx", raw: "@components/ChatInput.tsx" },
  { kind: "computer-use", label: "Computer Use", raw: "@computer" },
  { kind: "command", label: "Compact", raw: "/compact" },
  { kind: "command", label: "Collaboration: View", raw: "/collab view" },
];

test("command chips show only their friendly label while preserving the complete command", () => {
  const value = "/compact /collab view";
  const doc = parseComposerValue(value, mentions);
  const labels = [];
  doc.descendants((node) => {
    if (node.type.name === "mention") labels.push(node.attrs.label);
  });

  assert.deepEqual(labels, ["Compact", "Collaboration: View"]);
  assert.equal(serializeComposerDocument(doc), value);
  assert.doesNotMatch(editorCss, /\.mentionChip\[data-mention-kind="command"\] \.mentionIcon\s*\{[^}]*display:\s*none/s);
});

test("mention chips use the measured Codex inline layout and preserve semantic icons", () => {
  const chipRule = editorCss.slice(editorCss.indexOf(".mentionChip {"), editorCss.indexOf(".mentionChip[data-mention-kind"));
  const iconRule = editorCss.slice(editorCss.indexOf(".mentionIcon {"), editorCss.indexOf(".mentionChip[data-mention-kind=\"file\"]"));
  assert.match(chipRule, /padding-inline:\s*2px/);
  assert.match(chipRule, /color:\s*var\(--ui-inline-mention\)/);
  assert.match(chipRule, /font-weight:\s*var\(--font-weight-medium\)/);
  assert.doesNotMatch(chipRule, /\bborder(?:-radius)?:|\bbackground:|\bfont-size:|\bline-height:/);
  assert.match(iconRule, /width:\s*16px/);
  assert.match(iconRule, /height:\s*1lh/);
  assert.match(iconRule, /margin-inline-end:\s*3px/);
  assert.match(editorSource, /icon:\s*\{ default: "action" \}/);
  assert.match(editorSource, /dataset\.mentionIcon/);
  assert.doesNotMatch(editorCss, /data-mention-kind="command"[^}]*display:\s*none/s);
});

test("round-trips ProseMirror chips through OMP-compatible plain text", () => {
  const value = "Use /skill:codebase-design with @components/ChatInput.tsx and @computer";
  const doc = parseComposerValue(value, mentions);

  assert.equal(serializeComposerDocument(doc), value);
  const kinds = [];
  doc.descendants((node) => {
    if (node.type.name === "mention") kinds.push(node.attrs.kind);
  });
  assert.deepEqual(kinds, ["skill", "file", "computer-use"]);
});

test("does not turn email fragments or longer words into chips", () => {
  const value = "mail@example.com and @computerized";
  const doc = parseComposerValue(value, mentions);
  let chips = 0;
  doc.descendants((node) => {
    if (node.type.name === "mention") chips += 1;
  });
  assert.equal(chips, 0);
  assert.equal(serializeComposerDocument(doc), value);
});

test("preserves multiline drafts around mention chips", () => {
  const value = "First line\n/skill:codebase-design second line";
  assert.equal(serializeComposerDocument(parseComposerValue(value, mentions)), value);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const globalsRaw = await readFile(new URL("../../app/globals.css", import.meta.url), "utf8");
// A comment can hold a colon, so the parser below removes every comment first.
const globals = globalsRaw.replace(/\/\*[\s\S]*?\*\//g, "");
const messageStyles = await readFile(new URL("./message-view.module.css", import.meta.url), "utf8");
const terminalStyles = await readFile(new URL("./terminal-output.module.css", import.meta.url), "utf8");
const chatStyles = await readFile(new URL("./chat.module.css", import.meta.url), "utf8");
const chatWindowStyles = await readFile(new URL("./chat-window.module.css", import.meta.url), "utf8");
const tokens = await readFile(new URL("../../app/tokens.css", import.meta.url), "utf8");

function token(name) {
  const match = new RegExp(`--${name}:\\s*([^;]+);`).exec(tokens);
  assert.ok(match, `the token sheet declares --${name}`);
  return match[1].trim();
}

function proseRule() {
  const match = /\.markdown-body \{([^}]*)\}/.exec(globals);
  assert.ok(match, "globals.css declares .markdown-body");
  const declarations = new Map();
  for (const part of match[1].split(";")) {
    const [property, ...rest] = part.split(":");
    if (rest.length === 0) continue;
    declarations.set(property.trim(), rest.join(":").trim());
  }
  return declarations;
}

test("the typography tokens hold the transcript prose measurements", () => {
  assert.equal(token("text-base"), "14px");
  assert.equal(token("leading-base"), "22px");
  assert.equal(token("leading-transcript"), "23px");
});

test("transcript prose measures exactly 14px over 22px", () => {
  const prose = proseRule();

  assert.equal(prose.get("font-size"), "var(--text-base)");
  assert.equal(prose.get("line-height"), "var(--leading-base)");
});

test("transcript prose no longer uses a ratio line height", () => {
  const prose = proseRule();
  const lineHeight = prose.get("line-height");

  // A ratio of 1.7 produced 23.8px, which missed the 22px measurement.
  assert.doesNotMatch(lineHeight, /^[0-9.]+$/);
  assert.equal(Number.parseFloat(token("text-base")) * 1.7 === 22, false);
});

test("main user and assistant text uses the selected 14px size", () => {
  assert.match(messageStyles, /\.userBubble\s*\{[^}]*font-size:\s*var\(--text-base\);[^}]*line-height:\s*var\(--leading-transcript\);/s);
  assert.match(messageStyles, /\.assistantBlocks\s*\{[^}]*font-size:\s*var\(--text-base\);[^}]*line-height:\s*var\(--leading-transcript\);/s);
  assert.match(messageStyles, /\.userBubble\s+:global\(\.markdown-body\),[\s\S]*?font-size:\s*var\(--text-base\);[\s\S]*?line-height:\s*var\(--leading-transcript\);/);
});

test("secondary transcript reading text uses one 13px size", () => {
  assert.doesNotMatch(messageStyles, /font-size:\s*(?:12\.5|15)px/);
  assert.match(chatWindowStyles, /\.processDetailsTrigger\s*\{[^}]*font-size:\s*var\(--text-sm\);/s);
});

test("secondary monospace text uses the visually matched 11px size", () => {
  for (const selector of [
    "providerError",
    "largeMessageContent",
    "toolName",
    "toolPreview",
    "diffStats",
    "toolInput",
    "splitDiffFile",
    "patchText",
    "pairedResultContent",
    "messageCardType",
    "customMessageDetails",
    "streamingCodeContent",
  ]) {
    assert.match(messageStyles, new RegExp(`\\.${selector}\\s*\\{[^}]*font-size:\\s*var\\(--text-2xs\\);`, "s"));
  }
  assert.doesNotMatch(terminalStyles, /font-size:\s*var\(--text-(?:xs|sm|base)\)/);
  assert.match(terminalStyles, /\.preview\s*\{[^}]*font-size:\s*var\(--text-2xs\);/s);
  assert.match(chatStyles, /\.writtenFileAction\s*\{[^}]*font-size:\s*var\(--text-2xs\);/s);
  assert.match(chatWindowStyles, /\.extensionWidgetTitle\s*\{[^}]*font-size:\s*var\(--text-2xs\);/s);
  assert.match(chatWindowStyles, /\.extensionWidgetBody\s*\{[^}]*font-size:\s*var\(--text-2xs\);/s);
});

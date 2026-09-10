import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("ChatWindow grows a Codex response spacer while prework is active", async () => {
  const [chat, spacer, sheet] = await Promise.all([
    readFile(new URL("../ChatWindow.tsx", import.meta.url), "utf8"),
    readFile(new URL("./ActiveTurnResponseSpacer.tsx", import.meta.url), "utf8"),
    readFile(new URL("./chat-window.module.css", import.meta.url), "utf8"),
  ]);

  assert.match(chat, /const showActiveTurnResponseSpacer = agentRunning/);
  assert.doesNotMatch(chat, /showActiveTurnResponseSpacer[^;]+hasFinalAssistantAnswer/);
  assert.match(chat, /<ActiveTurnResponseSpacer[\s\S]*?active=\{showActiveTurnResponseSpacer\}[\s\S]*?scrollContainerRef=\{scrollContainerRef\}[\s\S]*?onConsumed=\{releaseActiveTurnHold\}/);
  assert.match(spacer, /ResizeObserver/);
  assert.match(spacer, /consumeActiveTurnSpacerHeight/);
  assert.match(spacer, /container\.addEventListener\("scroll", consumeSpacer/);
  assert.match(sheet, /\.responseSpacer\s*\{[^}]*height:\s*var\(--ui-response-spacer-height\);[^}]*transition:\s*height 500ms var\(--ease-enter\);/s);
  assert.match(chat, /phase\?\.kind === "waiting_model"\) return t\("chat\.thinking"\)/);
  assert.match(chat, /<ActiveTurnResponseSpacer[\s\S]*?<div ref=\{messagesEndRef\}/);
});

test("the active Thinking placeholder matches Codex text and shimmer treatment", async () => {
  const [english, sheet] = await Promise.all([
    readFile(new URL("../../lib/i18n/messages/en.ts", import.meta.url), "utf8"),
    readFile(new URL("./chat-window.module.css", import.meta.url), "utf8"),
  ]);

  assert.match(english, /"chat\.thinking": "Thinking"/);
  assert.match(sheet, /\.phaseStatus\s*\{[^}]*color:\s*color-mix\(in srgb, var\(--ui-text\) 60%, transparent\)/s);
  assert.match(sheet, /\.phasePulse\s*\{[^}]*background-color:\s*var\(--phase-shimmer-base\)/s);
  assert.match(sheet, /@keyframes chatPhaseShimmer/);
  assert.match(sheet, /prefers-reduced-motion:\s*reduce[\s\S]*?\.phasePulse\s*\{[^}]*animation:\s*none/s);
});

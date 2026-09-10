import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const scopedFiles = [
  "./ChatWindow.tsx",
  "./MessageView.tsx",
  "./MarkdownBody.tsx",
  "./MermaidBlock.tsx",
  "./FrontmatterCard.tsx",
  "./TurnWrittenFiles.tsx",
  "./ExtensionStatusBar.tsx",
  "./ReeveWordmark.tsx",
  "./chat/chat.module.css",
  "./chat/chat-window.module.css",
  "./chat/message-view.module.css",
];

const forbiddenColorPatterns = [
  /#[0-9a-f]{3,8}\b/gi,
  /\brgba?\s*\(/gi,
  /\bhsla?\s*\(/gi,
  /["'](?:black|white|red|green|blue|orange|yellow|purple|gray|grey)["']/gi,
  /\b(?:text|bg|border|fill|stroke)-(?:red|blue|green|yellow|orange|amber|purple|pink|gray|grey|slate|zinc|neutral|stone|cyan|teal|emerald|lime|indigo|violet|fuchsia|rose)-\d{2,3}\b/gi,
];

test("uses Tier 2 semantic tokens for transcript interface colors", async () => {
  const violations = [];

  for (const file of scopedFiles) {
    const source = await readFile(new URL(file, import.meta.url), "utf8");
    const lines = source.split("\n");

    for (const [index, line] of lines.entries()) {
      for (const pattern of forbiddenColorPatterns) {
        pattern.lastIndex = 0;
        const matches = [...line.matchAll(pattern)].map((match) => match[0]);
        if (matches.length > 0) {
          violations.push(`${file}:${index + 1}: ${matches.join(", ")}`);
        }
      }
    }
  }

  assert.deepEqual(violations, []);
});

test("keeps transcript layout and message presentation in dedicated CSS modules", async () => {
  const chatWindow = await readFile(new URL("./ChatWindow.tsx", import.meta.url), "utf8");
  const messageView = await readFile(new URL("./MessageView.tsx", import.meta.url), "utf8");
  const mermaidBlock = await readFile(new URL("./MermaidBlock.tsx", import.meta.url), "utf8");
  const chatWindowCss = await readFile(new URL("./chat/chat-window.module.css", import.meta.url), "utf8");
  const messageViewCss = await readFile(new URL("./chat/message-view.module.css", import.meta.url), "utf8");

  assert.match(chatWindow, /chat-window\.module\.css/);
  assert.match(messageView, /message-view\.module\.css/);
  assert.match(mermaidBlock, /message-view\.module\.css/);
  assert.match(chatWindowCss, /max-width:\s*var\(--thread-content-max-width\)/);
  assert.match(messageViewCss, /font-size:\s*var\(--text-base\)/);
  assert.match(messageViewCss, /line-height:\s*var\(--leading-base\)/);
  assert.match(messageViewCss, /max-width:\s*70%/);
  assert.match(messageViewCss, /max-width:\s*min\(456px, 100%\)/);
});

test("removes static inline styles from the transcript components", async () => {
  const files = [
    "./ChatWindow.tsx",
    "./MessageView.tsx",
    "./MarkdownBody.tsx",
    "./MermaidBlock.tsx",
    "./FrontmatterCard.tsx",
  ];
  const violations = [];

  for (const file of files) {
    const source = await readFile(new URL(file, import.meta.url), "utf8");
    for (const [index, line] of source.split("\n").entries()) {
      if (/\bstyle=\{\{/.test(line)) violations.push(`${file}:${index + 1}`);
    }
  }

  assert.deepEqual(violations, []);
});

import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";
import { readFile } from "node:fs/promises";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});

const { SourcesView } = await jiti.import("./SourcesView.tsx");
const { I18nProvider } = await jiti.import("../hooks/useI18n.tsx");
const styles = await readFile(new URL("./navigation/sources-view.module.css", import.meta.url), "utf8");

test("the Sources tab renders every source with Codex activity details", () => {
  const sources = [
    { activity: "attached", id: "image:1", kind: "image", label: "reference.png", url: "data:image/png;base64,aGVsbG8=" },
    { activity: "read", id: "file:1", kind: "file", label: "guide.md", path: "/project/docs/guide.md" },
    { activity: "provided", id: "url:1", kind: "url", label: "example.com", url: "https://example.com" },
    { activity: "read", id: "file:2", kind: "file", label: "notes.md", path: "/project/notes.md" },
  ];
  const markup = renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(SourcesView, { sources, onOpenFile() {} }),
    ),
  );

  assert.equal((markup.match(/data-source-kind=/g) ?? []).length, 4);
  assert.match(markup, /reference\.png/);
  assert.match(markup, /Attached to the conversation/);
  assert.match(markup, /\/project\/docs\/guide\.md/);
  assert.match(markup, /Read during the chat/);
  assert.match(markup, /Provided in the conversation/);
});

test("the Sources tab uses 18px previews and separated rows", () => {
  assert.match(styles, /\.icon img\s*\{[^}]*width:\s*18px;[^}]*height:\s*18px;/s);
  assert.match(styles, /\.source\s*\{[^}]*border-bottom:\s*1px solid var\(--ui-border\);/s);
  assert.match(styles, /\.panel\s*\{[^}]*overflow-y:\s*auto;/s);
});

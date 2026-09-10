import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const {
  ExtensionStatusBar,
  formatExtensionStatusLine,
  sanitizeExtensionStatusText,
} = await jiti.import("./ExtensionStatusBar.tsx");

test("sorts status text by hidden key like the Pi CLI footer", () => {
  const statuses = [
    { key: "20-memory", text: "memory" },
    { key: "90-notify", text: "notify" },
    { key: "10-permissions", text: "permissions" },
    { key: "05-ponytail", text: "ponytail" },
  ];

  assert.equal(
    formatExtensionStatusLine(statuses),
    "ponytail permissions memory notify",
  );
});

test("sanitizes status text for a single-line display", () => {
  assert.equal(
    sanitizeExtensionStatusText("  first\tsecond \r\n third  "),
    "first second third",
  );
});

test("renders a single status line without identifier keys", () => {
  const html = renderToStaticMarkup(
    React.createElement(ExtensionStatusBar, {
      statuses: [
        { key: "20-memory", text: "\x1b[32mmemory\x1b[0m" },
        { key: "05-ponytail", text: "ponytail" },
      ],
    }),
  );

  assert.match(html, /aria-label="ponytail memory"/);
  assert.match(html, /data-extension-status="true"/);
  assert.match(html, /data-extension-status-line="true"/);
  assert.match(html, />ponytail <\/span>/);
  assert.match(html, /style="color:#16a34a"[^>]*>memory</);
  assert.match(html, />memory</);
  assert.doesNotMatch(html, /05-ponytail|20-memory/);

  const rootTag = html.match(/^<div[^>]*>/)?.[0] ?? "";
  const lineTag = html.match(/<span[^>]*data-extension-status-line="true"[^>]*>/)?.[0] ?? "";
  assert.doesNotMatch(rootTag, /style=/);
  assert.doesNotMatch(lineTag, /style=/);
});

test("renders nothing when extensions have no statuses", () => {
  const html = renderToStaticMarkup(
    React.createElement(ExtensionStatusBar, { statuses: [] }),
  );

  assert.equal(html, "");
});

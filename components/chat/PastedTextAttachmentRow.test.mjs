import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const { PastedTextAttachmentRow } = await jiti.import("./PastedTextAttachmentRow.tsx");
const { I18nProvider } = await jiti.import("../../hooks/useI18n.tsx");

function renderRow(attachments) {
  return renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(PastedTextAttachmentRow, { attachments }),
    ),
  );
}

test("renders one pasted-text attachment with its shipped label", () => {
  const html = renderRow([{ name: "Pasted text.txt", kind: "file", available: true, uploaded: true, content: "first paste" }]);

  assert.match(html, /Pasted text/);
  assert.doesNotMatch(html, /first paste/);
});

test("previews the first pasted-text attachment and counts the remaining pastes", () => {
  const oneRemaining = renderRow([
    { name: "Pasted text.txt", kind: "file", available: true, uploaded: true, content: "first preview" },
    { name: "Pasted text.txt", kind: "file", available: true, uploaded: true, content: "second paste" },
  ]);
  const twoRemaining = renderRow([
    { name: "Pasted text.txt", kind: "file", available: true, uploaded: true, content: "first preview" },
    { name: "Pasted text.txt", kind: "file", available: true, uploaded: true, content: "second paste" },
    { name: "Pasted text.txt", kind: "file", available: true, uploaded: true, content: "third paste" },
  ]);

  assert.match(oneRemaining, /Pasted text\.txt \(\+1 more pasted text attachment\)/);
  assert.match(twoRemaining, /Pasted text\.txt \(\+2 more pasted text attachments\)/);
  assert.doesNotMatch(twoRemaining, /third paste/);
});

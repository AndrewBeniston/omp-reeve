import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";
import { I18nProvider } from "../../hooks/useI18n.tsx";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { FullAccessConfirmDialog } = await jiti.import("./FullAccessConfirmDialog.tsx");

test("names each area affected by Full Access", () => {
  const html = renderToStaticMarkup(React.createElement(
    I18nProvider,
    null,
    React.createElement(FullAccessConfirmDialog, {
      busy: false,
      onCancel() {},
      onConfirm() {},
    }),
  ));
  assert.match(html, /role="dialog"/);
  assert.match(html, /Turn on Full Access\?/);
  assert.match(html, /Files and folders/);
  assert.match(html, /Terminal commands/);
  assert.match(html, /Internet and connected apps/);
});

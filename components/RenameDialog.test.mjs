import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const { RenameDialog } = await jiti.import("./RenameDialog.tsx");
const { I18nProvider } = await jiti.import("../hooks/useI18n.tsx");

test("the rename dialog contains the Codex title, input, and actions", () => {
  const html = renderToStaticMarkup(React.createElement(
    I18nProvider,
    null,
    React.createElement(RenameDialog, {
      initialName: "Fixture session",
      open: true,
      onCancel() {},
      async onSave() { return true; },
    }),
  ));

  assert.match(html, /role="dialog"/);
  assert.match(html, />Rename chat</);
  assert.match(html, />Keep it short and recognizable</);
  assert.match(html, /value="Fixture session"/);
  assert.match(html, />Cancel</);
  assert.match(html, />Save</);
});

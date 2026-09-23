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
const { SessionLoadingState } = await jiti.import("./SessionLoadingState.tsx");
const { I18nProvider } = await jiti.import("../../hooks/useI18n.tsx");

function renderLoadingState(active = true) {
  return renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(SessionLoadingState, { active }),
    ),
  );
}

test("renders one polite loading status above the composer", () => {
  const html = renderLoadingState();

  assert.match(html, /role="status"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /data-session-loading=""/);
  assert.match(html, /data-session-loading-spinner=""/);
  assert.equal((html.match(/data-session-loading-spinner=""/g) ?? []).length, 1);
  assert.match(html, /Loading task…/);
});

test("removes the loading row when loading succeeds", () => {
  assert.equal(renderLoadingState(false), "");
});

test("keeps the existing Session error path and Session-scoped mount", async () => {
  const chatWindow = await readFile(new URL("../ChatWindow.tsx", import.meta.url), "utf8");
  const appShell = await readFile(new URL("../AppShell.tsx", import.meta.url), "utf8");

  assert.match(chatWindow, /if \(error\) \{[\s\S]*?\{error\}[\s\S]*?return \(/);
  assert.match(chatWindow, /<SessionLoadingState active=\{loading\} \/>[\s\S]*?\{chatInputElement\}/);
  assert.match(appShell, /<ChatWindow[\s\S]*?key=\{sessionKey\}/);
});

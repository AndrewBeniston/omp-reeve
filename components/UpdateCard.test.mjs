import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { UpdateCardView, updateCardIsVisible } = await jiti.import("./UpdateCard.tsx");
const { I18nProvider } = await jiti.import("../hooks/useI18n.tsx");

const base = {
  currentVersion: "0.5.0",
  phase: "downloading",
  availableVersion: "0.5.1",
  releaseNotes: null,
  percent: 37,
  error: null,
  checkedAt: 1,
};

function render(state) {
  return renderToStaticMarkup(
    React.createElement(I18nProvider, null,
      React.createElement(UpdateCardView, { state, onInstall() {}, onDismiss() {} })),
  );
}

test("the card is visible only while an update downloads or waits to install", () => {
  assert.equal(updateCardIsVisible(null, null), false);
  assert.equal(updateCardIsVisible({ ...base, phase: "idle", availableVersion: null }, null), false);
  assert.equal(updateCardIsVisible({ ...base, phase: "up-to-date", availableVersion: null }, null), false);
  assert.equal(updateCardIsVisible({ ...base, phase: "error" }, null), false);
  assert.equal(updateCardIsVisible(base, null), true);
  assert.equal(updateCardIsVisible({ ...base, phase: "ready" }, null), true);
  assert.equal(updateCardIsVisible({ ...base, phase: "ready" }, "0.5.1"), false);
  assert.equal(updateCardIsVisible({ ...base, phase: "ready", availableVersion: "0.5.2" }, "0.5.1"), true);
});

test("while downloading the card shows the version, a progress bar, and no restart button", () => {
  const html = render(base);
  assert.match(html, /Downloading Reeve 0\.5\.1/);
  assert.match(html, /role="progressbar"/);
  assert.match(html, /aria-valuenow="37"/);
  assert.match(html, /--ui-progress:37%/);
  assert.doesNotMatch(html, /Restart now/);
  assert.match(html, /Read more/);
});

test("once ready the card offers Restart now and drops the progress bar", () => {
  const html = render({ ...base, phase: "ready", percent: 100 });
  assert.match(html, /Reeve 0\.5\.1 is ready to install/);
  assert.match(html, /Restart now/);
  assert.doesNotMatch(html, /role="progressbar"/);
  assert.match(html, /aria-label="Dismiss update notice"/);
});

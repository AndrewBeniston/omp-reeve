import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { ClearBrowsingDataView, clearBrowsingDataMessage } = await jiti.import("./ClearBrowsingData.tsx");

const render = (phase, reloaded = 0) => renderToStaticMarkup(
  React.createElement(ClearBrowsingDataView, { phase, reloaded, onClear: () => {} }),
);
const text = (markup) => markup.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");

test("the control says what it takes before it is pressed, not after", () => {
  const body = text(render("idle"));

  // The tabs share one session, which is the feature and the reason there is no
  // smaller control. Somebody deciding whether to press this needs to know.
  assert.match(body, /signs you out of all of them/i);
  assert.match(body, /no smaller unit/i);
  assert.match(body, /Clear browsing data/);
});

test("clearing reports how many open tabs were reloaded", () => {
  // A page on screen keeps its own memory of being signed in until it reloads,
  // so saying nothing here would leave somebody looking at a signed-in tab and
  // doubting the control worked.
  assert.match(clearBrowsingDataMessage("cleared", 2), /2 open tabs were reloaded/);
  assert.match(clearBrowsingDataMessage("cleared", 1), /1 open tab was reloaded/);
  assert.equal(clearBrowsingDataMessage("cleared", 0), "Browsing data cleared.");
});

test("a cleared panel says so, and a failed one does not pretend", () => {
  assert.match(render("cleared", 1), /data-browsing-data-phase="cleared"/);
  assert.match(text(render("cleared", 1)), /Cleared/);

  const failed = render("failed");
  assert.match(failed, /data-browsing-data-phase="failed"/);
  assert.match(failed, /role="alert"/, "a failure must be announced, not shown quietly");
  assert.match(text(failed), /Unable to clear browsing data/);
});

test("the control is not offered twice while it is working", () => {
  assert.match(render("clearing"), /disabled=""/);
});

test("the browser version says so", () => {
  const markup = render("unsupported");
  assert.match(markup, /disabled=""/);
  assert.match(text(markup), /desktop application/);
});

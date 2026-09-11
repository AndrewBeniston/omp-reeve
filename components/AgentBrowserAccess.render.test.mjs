import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { AgentBrowserAccessView } = await jiti.import("./AgentBrowserAccess.tsx");

function render(state, { supported = true, busy = false } = {}) {
  return renderToStaticMarkup(
    React.createElement(AgentBrowserAccessView, { state, supported, busy, onToggle: () => {} }),
  );
}

const text = (markup) => markup.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");

test("the closed panel offers the grant and promises nothing is listening", () => {
  const markup = render({ granted: false, openThisLaunch: false, restartRequired: false, cdpUrl: null });

  assert.match(markup, /data-agent-browser-phase="closed"/);
  assert.match(text(markup), /Nothing is listening/);
  assert.match(markup, /aria-pressed="false"/);
  // No address to give away while the door is shut.
  assert.doesNotMatch(markup, /127\.0\.0\.1/);
});

test("the open panel shows the address and says it changes", () => {
  const markup = render({ granted: true, openThisLaunch: true, restartRequired: false, cdpUrl: "http://127.0.0.1:63682" });

  assert.match(markup, /data-agent-browser-phase="open"/);
  assert.match(markup, /http:\/\/127\.0\.0\.1:63682/);
  assert.match(text(markup), /changes every time Reeve starts/);
  assert.match(markup, /aria-pressed="true"/);
});

test("a granted but not yet open panel asks for a restart and offers no address", () => {
  const markup = render({ granted: true, openThisLaunch: false, restartRequired: true, cdpUrl: null });

  assert.match(markup, /data-agent-browser-phase="opens-next-launch"/);
  assert.match(text(markup), /Restart needed/);
  // The agent cannot connect yet. An address here would be a dead end.
  assert.doesNotMatch(markup, /127\.0\.0\.1/);
});

test("a withdrawn but still open panel does not pretend to be shut", () => {
  const markup = render({ granted: false, openThisLaunch: true, restartRequired: true, cdpUrl: "http://127.0.0.1:63682" });

  assert.match(markup, /data-agent-browser-phase="closes-next-launch"/);
  const body = text(markup);
  assert.match(body, /still open/i);
  assert.match(body, /Restart needed/);
  // The toggle reads off, because the decision is off. The badge is what
  // carries the fact that the door has not shut yet.
  assert.match(markup, /aria-pressed="false"/);
});

test("every state warns that this exposes the application, not only the tabs", () => {
  const states = [
    { granted: false, openThisLaunch: false, restartRequired: false, cdpUrl: null },
    { granted: true, openThisLaunch: true, restartRequired: false, cdpUrl: "http://127.0.0.1:1" },
    { granted: true, openThisLaunch: false, restartRequired: true, cdpUrl: null },
  ];
  for (const state of states) {
    const body = text(render(state));
    assert.match(body, /whole application window/, `missing the warning for ${JSON.stringify(state)}`);
    assert.match(body, /no password of its own/);
  }
});

test("the browser version says so and cannot be toggled", () => {
  const markup = render(null, { supported: false });

  assert.match(markup, /data-agent-browser-phase="unsupported"/);
  assert.match(text(markup), /desktop application/);
  assert.match(markup, /disabled=""/);
});

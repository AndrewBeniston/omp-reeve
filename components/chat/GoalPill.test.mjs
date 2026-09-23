import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";
import { mount, click, focused } from "../../test/dom-harness.mjs";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { GoalPill } = await jiti.import("./GoalPill.tsx");
const { I18nProvider } = await jiti.import("../../hooks/useI18n.tsx");

function makeGoal(status, overrides = {}) {
  return {
    id: "goal-one",
    objective: "Finish the film",
    status,
    tokensUsed: 700,
    timeUsedSeconds: 12,
    createdAt: 1_000,
    updatedAt: 2_000,
    ...overrides,
  };
}

function renderGoal(goal, props = {}) {
  return renderToStaticMarkup(
    React.createElement(I18nProvider, null, React.createElement(GoalPill, { goal, ...props })),
  );
}

test("an active Goal shows the OMP status and objective", () => {
  const html = renderGoal(makeGoal("active"));
  assert.match(html, /Pursuing goal/);
  assert.match(html, /Finish the film/);
});

test("the pill uses only OMP Goal statuses and disappears after a drop", () => {
  for (const [status, label] of [
    ["paused", "Paused goal"],
    ["budget-limited", "Goal limited"],
    ["complete", "Goal achieved"],
  ]) {
    assert.match(renderGoal(makeGoal(status)), new RegExp(label));
  }
  assert.equal(renderGoal(makeGoal("dropped")), "");
  assert.equal(renderGoal(null), "");
});

test("a budgeted active or limited Goal shows real over-budget token use", () => {
  for (const status of ["active", "budget-limited"]) {
    const html = renderGoal(makeGoal(status, { tokensUsed: 133_700, tokenBudget: 100_000 }));
    assert.match(html, /133\.7K \/ 100K/);
  }
});

test("an unbudgeted Goal and inactive Goals show elapsed time instead of tokens", () => {
  for (const goal of [
    makeGoal("active"),
    makeGoal("paused", { tokenBudget: 2_000 }),
    makeGoal("complete", { tokenBudget: 2_000 }),
  ]) {
    const html = renderGoal(goal);
    assert.match(html, />12s</);
    assert.doesNotMatch(html, /700 \/ 2K/);
  }
});

test("an active elapsed metric ticks each second and freezes when paused", async () => {
  const oldNow = Date.now;
  const oldSetInterval = globalThis.setInterval;
  const oldClearInterval = globalThis.clearInterval;
  let now = 10_000;
  let tick;
  const cleared = [];
  Date.now = () => now;
  globalThis.setInterval = (callback, delay) => {
    assert.equal(delay, 1_000);
    tick = callback;
    return 42;
  };
  globalThis.clearInterval = (id) => { cleared.push(id); };
  const wrap = (goal) => React.createElement(I18nProvider, null, React.createElement(GoalPill, { goal }));
  let view;
  try {
    view = await mount(wrap(makeGoal("active", { updatedAt: 8_000 })));
    assert.match(view.container.textContent, /14s/);
    now = 11_000;
    await React.act(async () => { tick(); });
    assert.match(view.container.textContent, /15s/);
    await view.render(wrap(makeGoal("paused", { updatedAt: 11_000 })));
    assert.match(view.container.textContent, /12s/);
    assert.deepEqual(cleared, [42]);
    now = 20_000;
    await React.act(async () => { tick(); });
    assert.match(view.container.textContent, /12s/);
  } finally {
    if (view) await view.unmount();
    Date.now = oldNow;
    globalThis.setInterval = oldSetInterval;
    globalThis.clearInterval = oldClearInterval;
  }
});

test("a completed Goal remains visible for three seconds after OMP clears it", async () => {
  const oldSetTimeout = globalThis.setTimeout;
  const oldClearTimeout = globalThis.clearTimeout;
  let expire;
  const cancelled = [];
  globalThis.setTimeout = (callback, delay, ...args) => {
    if (delay === 3_000) { expire = callback; return 97; }
    return oldSetTimeout(callback, delay, ...args);
  };
  globalThis.clearTimeout = (id) => {
    if (id === 97) cancelled.push(id);
    else oldClearTimeout(id);
  };
  const wrap = (goal) => React.createElement(I18nProvider, null, React.createElement(GoalPill, { goal }));
  let view;
  try {
    view = await mount(wrap(makeGoal("complete")));
    assert.match(view.container.textContent, /Goal achieved/);
    assert.equal(typeof expire, "function");
    await view.render(wrap(null));
    assert.match(view.container.textContent, /Goal achieved/);
    assert.deepEqual(cancelled, []);
    await React.act(async () => { expire(); });
    assert.equal(view.container.textContent, "");
  } finally {
    if (view) await view.unmount();
    globalThis.setTimeout = oldSetTimeout;
    globalThis.clearTimeout = oldClearTimeout;
  }
});

test("the pill places clear, pause or resume, and edit after the metric", () => {
  const handlers = { onClear() {}, onPause() {}, onResume() {}, onExpand() {} };
  for (const [status, middleLabel] of [["active", "Pause goal"], ["paused", "Resume goal"]]) {
    const html = renderGoal(makeGoal(status), handlers);
    const positions = [
      html.indexOf("Finish the film"),
      html.indexOf("12s"),
      html.indexOf('aria-label="Clear goal"'),
      html.indexOf(`aria-label="${middleLabel}"`),
      html.indexOf('aria-label="Edit goal"'),
    ];
    assert.ok(positions.every((position) => position >= 0));
    assert.ok(positions.every((position, index) => index === 0 || position > positions[index - 1]));
  }
});

test("clearing during active work asks first and sends one command after confirmation", async () => {
  let clears = 0;
  const wrap = () => React.createElement(I18nProvider, null, React.createElement(GoalPill, {
    goal: makeGoal("active"), isRunning: true, onClear: async () => { clears += 1; return true; },
  }));
  const view = await mount(wrap());
  try {
    const root = view.container.ownerDocument.body;
    await click(view.container.querySelector('button[aria-label="Clear goal"]'));
    assert.equal(clears, 0);
    assert.match(root.textContent, /Clear current goal\?/);
    const confirm = root.querySelector('button[data-action="confirm-clear-goal"]');
    assert.equal(focused(), confirm);
    await React.act(async () => { confirm.click(); confirm.click(); });
    assert.equal(clears, 1);
  } finally { await view.unmount(); }
});

test("the paused Goal asks before resume and labels the keyboard control", async () => {
  let resumes = 0;
  const wrap = () => React.createElement(I18nProvider, null, React.createElement(GoalPill, {
    goal: makeGoal("paused"), onResume: async () => { resumes += 1; return true; },
  }));
  const view = await mount(wrap());
  try {
    const root = view.container.ownerDocument.body;
    const control = view.container.querySelector('button[aria-label="Resume goal"]');
    assert.equal(control.getAttribute("title"), "Resume goal");
    control.focus();
    assert.equal(focused(), control);
    await click(control);
    assert.equal(resumes, 0);
    assert.match(root.textContent, /Resume paused goal\?/);
    const confirm = root.querySelector('button[data-action="confirm-resume-goal"]');
    assert.equal(focused(), confirm);
    await click(confirm);
    assert.equal(resumes, 1);
  } finally { await view.unmount(); }
});

test("a failed action shows the reference error and keeps the controls available", () => {
  const html = renderGoal(makeGoal("active"), {
    onClear() {}, onPause() {},
    actionError: { action: "pause", message: "Unavailable" },
  });
  assert.match(html, /role="alert"[^>]*>Failed to update goal: Unavailable/);
  assert.match(html, /aria-label="Pause goal"[^>]*title="Pause goal"/);
  assert.doesNotMatch(html, /aria-label="Pause goal"[^>]*disabled/);
  const busy = renderGoal(makeGoal("active"), { onClear() {}, onPause() {}, pendingAction: "pause" });
  assert.match(busy, /aria-label="Pause goal"[^>]*disabled/);
  assert.match(busy, /aria-label="Clear goal"[^>]*disabled/);
});

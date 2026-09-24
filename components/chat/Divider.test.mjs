import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
import { React, click, mount, textOf } from "../../test/dom-harness.mjs";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { Divider } = await jiti.import("./Divider.tsx");
const { I18nProvider } = await jiti.import("../../hooks/useI18n.tsx");
const h = React.createElement;

async function renderDivider(props = {}) {
  return mount(h(I18nProvider, null, h(Divider, {
    turnId: "turn-1",
    status: "worked",
    startedAt: 0,
    completedAt: 65_000,
    previousMessageCount: 2,
    children: h("div", { "data-activity": "visible" }, "Activity"),
    ...props,
  })));
}

test("renders each live and complete divider label", async () => {
  const working = await renderDivider({ status: "working", startedAt: 0, completedAt: undefined, now: 999 });
  assert.match(textOf(working.container), /Working$/);
  await working.unmount();

  const workingFor = await renderDivider({ status: "working", startedAt: 0, completedAt: undefined, now: 65_000 });
  assert.match(textOf(workingFor.container), /Working for 1m 5s$/);
  await workingFor.unmount();

  const worked = await renderDivider();
  assert.match(textOf(worked.container), /Worked for 1m 5s/);
  await worked.unmount();

  const stopped = await renderDivider({ status: "stopped" });
  assert.match(textOf(stopped.container), /You stopped after 1m 5s/);
  await stopped.unmount();

  const processStopped = await renderDivider({ status: "stopped", stopSource: "process" });
  assert.match(textOf(processStopped.container), /The process stopped after 1m 5s/);
  await processStopped.unmount();
});

test("a live Divider clock ticks each second and freezes when complete", async () => {
  const originalNow = Date.now;
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
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
  let view;
  try {
    view = await renderDivider({ status: "working", startedAt: 10_000, completedAt: undefined });
    assert.match(textOf(view.container), /Working$/);
    now = 11_000;
    await React.act(async () => { tick(); });
    assert.match(textOf(view.container), /Working for 1s$/);
    now = 12_000;
    await React.act(async () => { tick(); });
    assert.match(textOf(view.container), /Working for 2s$/);
    await view.render(h(I18nProvider, null, h(Divider, {
      turnId: "turn-1",
      status: "worked",
      startedAt: 10_000,
      completedAt: 12_000,
      previousMessageCount: 2,
      children: h("div", { "data-activity": "visible" }, "Activity"),
    })));
    assert.match(textOf(view.container), /Worked for 2s/);
    now = 15_000;
    await React.act(async () => { tick(); });
    assert.match(textOf(view.container), /Worked for 2s/);
    assert.deepEqual(cleared, [42]);
  } finally {
    if (view) await view.unmount();
    Date.now = originalNow;
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  }
});

test("uses the previous-message label when clock data is absent", async () => {
  const view = await renderDivider({ status: "idle", startedAt: undefined, completedAt: undefined, previousMessageCount: 1 });
  assert.match(textOf(view.container), /1 previous message/);
  await view.unmount();
});

test("uses one disclosure and restores its per-turn choice after remount", async () => {
  globalThis.localStorage.setItem("omp-transcript-turn-open:turn-1", "true");
  const view = await renderDivider();
  const trigger = view.container.querySelector("button");

  assert.ok(trigger);
  assert.equal(trigger.getAttribute("aria-expanded"), "true");
  assert.equal(view.container.querySelector("[data-activity='visible']") !== null, true);
  await click(trigger);
  assert.equal(trigger.getAttribute("aria-expanded"), "false");
  assert.equal(view.container.querySelector("[data-activity='visible']"), null);
  assert.equal(globalThis.localStorage.getItem("omp-transcript-turn-open:turn-1"), "false");
  await view.unmount();

  const reloaded = await renderDivider();
  assert.equal(reloaded.container.querySelector("button").getAttribute("aria-expanded"), "false");
  assert.equal(reloaded.container.querySelector("[data-activity='visible']"), null);
  await reloaded.unmount();
});

test("keeps a forced-expanded turn open", async () => {
  globalThis.localStorage.setItem("omp-transcript-turn-open:turn-1", "false");
  const view = await renderDivider({ forceExpanded: true });
  const trigger = view.container.querySelector("button");

  assert.ok(trigger);
  assert.equal(trigger.getAttribute("aria-expanded"), "true");
  await click(trigger);
  assert.equal(trigger.getAttribute("aria-expanded"), "true");
  await view.unmount();
});

test("shows the denied-action count inside the same disclosure", async () => {
  const view = await renderDivider({ deniedActionCount: 2 });
  const trigger = view.container.querySelector("button");

  assert.ok(trigger);
  assert.match(textOf(trigger), /2 denied actions/);
  assert.equal(trigger.getAttribute("title"), "Auto-review denied 2 actions. View the actions and why they were denied.");
  await view.unmount();
});

test("hides a zero count and uses the singular tooltip", async () => {
  const view = await renderDivider({ deniedActionCount: 0 });
  assert.doesNotMatch(textOf(view.container), /denied action/);
  assert.equal(view.container.querySelector("button").getAttribute("title"), null);
  await view.unmount();

  const singular = await renderDivider({ deniedActionCount: 1 });
  assert.match(textOf(singular.container), /1 denied action/);
  assert.equal(singular.container.querySelector("button").getAttribute("title"), "Auto-review denied 1 action. View the action and why it was denied.");
  await singular.unmount();
});

test("denied-count clicks toggle without anchoring and log previous-turn expansion", async () => {
  let anchorRuns = 0;
  const originalRect = globalThis.HTMLElement.prototype.getBoundingClientRect;
  const originalObserver = globalThis.ResizeObserver;
  globalThis.HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
    anchorRuns += 1;
    return { top: 10, bottom: 20, left: 0, right: 0, width: 0, height: 10, x: 0, y: 10, toJSON() {} };
  };
  globalThis.ResizeObserver = class { observe() { anchorRuns += 1; } disconnect() {} };
  let productEvent;
  const listener = (event) => { productEvent = event.detail; };
  globalThis.addEventListener("reeve:product-event", listener);
  try {
    const view = await renderDivider({ deniedActionCount: 1, turnNumber: 2, totalTurnCount: 4 });
    const count = [...view.container.querySelectorAll("span")].find((element) => /denied action/.test(textOf(element)));
    assert.ok(count);
    anchorRuns = 0;
    await click(count);
    assert.equal(anchorRuns, 0);
    assert.equal(view.container.querySelector("button").getAttribute("aria-expanded"), "true");
    assert.deepEqual(productEvent, { name: "transcript_turn_expanded", turnNumber: 2, totalTurnCount: 4 });
    await view.unmount();
  } finally {
    globalThis.removeEventListener("reeve:product-event", listener);
    globalThis.HTMLElement.prototype.getBoundingClientRect = originalRect;
    globalThis.ResizeObserver = originalObserver;
  }
});

test("latest Turn expansion does not log a product event", async () => {
  let productEvent;
  const listener = (event) => { productEvent = event.detail; };
  globalThis.addEventListener("reeve:product-event", listener);
  try {
    const view = await renderDivider({ deniedActionCount: 1, turnNumber: 4, totalTurnCount: 4 });
    const count = [...view.container.querySelectorAll("span")].find((element) => /denied action/.test(textOf(element)));
    await click(count);
    assert.equal(productEvent, undefined);
    await view.unmount();
  } finally {
    globalThis.removeEventListener("reeve:product-event", listener);
  }
});

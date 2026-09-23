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
});

test("uses the previous-message label when clock data is absent", async () => {
  const view = await renderDivider({ status: "idle", startedAt: undefined, completedAt: undefined, previousMessageCount: 1 });
  assert.match(textOf(view.container), /1 previous message/);
  await view.unmount();
});

test("uses one collapsed disclosure and restores its per-turn choice", async () => {
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
  await view.unmount();
});

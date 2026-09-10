import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
import { React, domDocument, mount, settle } from "../../test/dom-harness.mjs";
const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { ActiveTurnResponseSpacer } = await jiti.import("./ActiveTurnResponseSpacer.tsx");

test("a spacer outside the viewport clears once and cannot reappear during the same turn", async () => {
  const previous = globalThis.IntersectionObserver;
  let observe;
  let consumed = 0;
  globalThis.IntersectionObserver = class {
    constructor(callback) { observe = callback; }
    observe() {}
    disconnect() {}
  };
  const container = domDocument.createElement("div");
  container.clientHeight = 600;
  container.scrollHeight = 2000;
  container.scrollTop = 0;
  let view;
  try {
    view = await mount(React.createElement(ActiveTurnResponseSpacer, {
      active: true, scrollContainerRef: { current: container }, onConsumed: () => consumed++,
    }));
    await settle();
    await React.act(async () => observe([{ boundingClientRect: { height: 360 }, intersectionRect: { height: 0 } }]));
    assert.equal(consumed, 1);
    await React.act(async () => observe([{ boundingClientRect: { height: 360 }, intersectionRect: { height: 0 } }]));
    assert.equal(consumed, 1);
    assert.equal(view.container.querySelector("[data-response-spacer]").getAttribute("data-consuming"), "true");
  } finally { await view?.unmount(); globalThis.IntersectionObserver = previous; }
});

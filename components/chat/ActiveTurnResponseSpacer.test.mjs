import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";
import { React, domDocument, domWindow, mount, setReducedMotion, settle } from "../../test/dom-harness.mjs";
const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { ActiveTurnResponseSpacer } = await jiti.import("./ActiveTurnResponseSpacer.tsx");

test("a spacer outside the viewport clears once and cannot reappear during the same turn", async () => {
  setReducedMotion(true);
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
  container.scrollTop = 1200;
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
  } finally {
    await view?.unmount();
    globalThis.IntersectionObserver = previous;
    setReducedMotion(false);
  }
});

test("the latest Turn reaches the end only inside the 300 px placement band", async () => {
  setReducedMotion(true);
  try {
  for (const [distance, shouldPlace] of [[300, true], [301, false]]) {
    const container = domDocument.createElement("div");
    container.clientHeight = 600;
    container.scrollHeight = 2000;
    container.scrollTop = 1400 - distance;
    const view = await mount(React.createElement(ActiveTurnResponseSpacer, {
      active: true, scrollContainerRef: { current: container }, onConsumed() {},
    }));
    try {
      assert.equal(container.scrollTop, shouldPlace ? 1399 : 1400 - distance);
    } finally { await view.unmount(); }
  }
  } finally { setReducedMotion(false); }
});

test("a new Turn opens the spacer with a spring while staying one pixel from the end", async () => {
  const createElement = domDocument.createElement.bind(domDocument);
  const previousFrame = globalThis.requestAnimationFrame;
  const previousCancel = globalThis.cancelAnimationFrame;
  const previousWindowFrame = domWindow.requestAnimationFrame;
  const previousWindowCancel = domWindow.cancelAnimationFrame;
  const frames = new Map();
  let frameId = 0;
  domWindow.requestAnimationFrame = globalThis.requestAnimationFrame = (callback) => {
    frames.set(++frameId, callback);
    return frameId;
  };
  domWindow.cancelAnimationFrame = globalThis.cancelAnimationFrame = (id) => frames.delete(id);
  domDocument.createElement = (tag) => {
    const element = createElement(tag);
    element.style.setProperty = (name, value) => { element.style[name] = value; };
    return element;
  };
  const container = domDocument.createElement("div");
  container.clientHeight = 600;
  container.scrollTop = 800;
  let spacer;
  Object.defineProperty(container, "scrollHeight", {
    get: () => 1640 + Number.parseFloat(spacer?.style["--ui-response-spacer-height"] ?? "0"),
  });
  const tick = async (at) => {
    const [id, callback] = frames.entries().next().value;
    frames.delete(id);
    await React.act(async () => callback(at));
  };
  let view;
  try {
    view = await mount(React.createElement(ActiveTurnResponseSpacer, {
      active: true, scrollContainerRef: { current: container }, onConsumed() {},
    }));
    spacer = view.container.querySelector("[data-response-spacer]");
    assert.equal(spacer.style["--ui-response-spacer-height"], "0px");
    assert.equal(container.scrollTop, 1039);
    await tick(0);
    await tick(250);
    const midpoint = Number.parseFloat(spacer.style["--ui-response-spacer-height"]);
    assert.ok(midpoint > 300 && midpoint < 360, `spring midpoint ${midpoint}`);
    assert.equal(container.scrollTop, container.scrollHeight - container.clientHeight - 1);
    await tick(500);
    assert.equal(spacer.style["--ui-response-spacer-height"], "360px");
    assert.equal(container.scrollTop, 1399);
    assert.equal(frames.size, 0);
  } finally {
    await view?.unmount();
    domDocument.createElement = createElement;
    globalThis.requestAnimationFrame = previousFrame;
    globalThis.cancelAnimationFrame = previousCancel;
    domWindow.requestAnimationFrame = previousWindowFrame;
    domWindow.cancelAnimationFrame = previousWindowCancel;
  }
});

test("a spacer target change of 24 px leaves the layout unchanged", async () => {
  setReducedMotion(true);
  const previous = globalThis.ResizeObserver;
  const previousFrame = globalThis.requestAnimationFrame;
  const previousCancel = globalThis.cancelAnimationFrame;
  const previousWindowFrame = domWindow.requestAnimationFrame;
  const previousWindowCancel = domWindow.cancelAnimationFrame;
  const createElement = domDocument.createElement.bind(domDocument);
  domDocument.createElement = (tag) => {
    const element = createElement(tag);
    element.style.setProperty = (name, value) => { element.style[name] = value; };
    return element;
  };
  let resize;
  globalThis.ResizeObserver = class {
    constructor(callback) { resize = callback; }
    observe() {}
    disconnect() {}
  };
  const container = domDocument.createElement("div");
  container.clientHeight = 600;
  container.scrollHeight = 2000;
  container.scrollTop = 1200;
  let view;
  try {
    view = await mount(React.createElement(ActiveTurnResponseSpacer, {
      active: true, scrollContainerRef: { current: container }, onConsumed() {},
    }));
    const spacer = view.container.querySelector("[data-response-spacer]");
    assert.equal(spacer.style["--ui-response-spacer-height"], "360px");
    setReducedMotion(false);
    const frames = new Map();
    let frameId = 0;
    domWindow.requestAnimationFrame = globalThis.requestAnimationFrame = (callback) => {
      frames.set(++frameId, callback);
      return frameId;
    };
    domWindow.cancelAnimationFrame = globalThis.cancelAnimationFrame = (id) => frames.delete(id);
    container.clientHeight = 624;
    resize();
    const [id, measure] = frames.entries().next().value;
    frames.delete(id);
    await React.act(async () => measure(0));
    assert.equal(spacer.style["--ui-response-spacer-height"], "360px");
    assert.equal(frames.size, 0, "a 24 px change schedules no spring frame");
  } finally {
    await view?.unmount();
    globalThis.ResizeObserver = previous;
    domDocument.createElement = createElement;
    globalThis.requestAnimationFrame = previousFrame;
    globalThis.cancelAnimationFrame = previousCancel;
    domWindow.requestAnimationFrame = previousWindowFrame;
    domWindow.cancelAnimationFrame = previousWindowCancel;
    setReducedMotion(false);
  }
});

test("the final answer clears a spacer held in prework follow and moves to the end", async () => {
  const createElement = domDocument.createElement.bind(domDocument);
  const previousFrame = globalThis.requestAnimationFrame;
  const previousCancel = globalThis.cancelAnimationFrame;
  const previousWindowFrame = domWindow.requestAnimationFrame;
  const previousWindowCancel = domWindow.cancelAnimationFrame;
  const frames = new Map();
  let frameId = 0;
  domWindow.requestAnimationFrame = globalThis.requestAnimationFrame = (callback) => {
    frames.set(++frameId, callback);
    return frameId;
  };
  domWindow.cancelAnimationFrame = globalThis.cancelAnimationFrame = (id) => frames.delete(id);
  domDocument.createElement = (tag) => {
    const element = createElement(tag);
    element.style.setProperty = (name, value) => { element.style[name] = value; };
    return element;
  };
  const container = domDocument.createElement("div");
  container.clientHeight = 600;
  container.scrollHeight = 2000;
  container.scrollTop = 1200;
  const scrollContainerRef = { current: container };
  let consumed = 0;
  const props = {
    active: true, scrollContainerRef, onConsumed: () => consumed++, followMode: "prework_follow",
  };
  let view;
  try {
    view = await mount(React.createElement(ActiveTurnResponseSpacer, { ...props, phase: "prework" }));
    const spacer = view.container.querySelector("[data-response-spacer]");
    const [firstId, firstFrame] = frames.entries().next().value;
    frames.delete(firstId);
    await React.act(async () => firstFrame(0));
    const [secondId, secondFrame] = frames.entries().next().value;
    frames.delete(secondId);
    await React.act(async () => secondFrame(250));
    assert.ok(Number.parseFloat(spacer.style["--ui-response-spacer-height"]) > 0);
    assert.equal(frames.size, 1, "the spring has a pending frame");
    container.scrollTop = 900;
    await view.render(React.createElement(ActiveTurnResponseSpacer, { ...props, phase: "final-answer" }));
    assert.equal(spacer.style["--ui-response-spacer-height"], "0px");
    assert.equal(container.scrollTop, 1400);
    assert.equal(consumed, 1);
    assert.equal(frames.size, 0, "the reset cancels the spring");
  } finally {
    await view?.unmount();
    domDocument.createElement = createElement;
    globalThis.requestAnimationFrame = previousFrame;
    globalThis.cancelAnimationFrame = previousCancel;
    domWindow.requestAnimationFrame = previousWindowFrame;
    domWindow.cancelAnimationFrame = previousWindowCancel;
  }
});

test("a larger spacer change follows a zero-bounce spring over 500 ms", async () => {
  const css = await readFile(new URL("./chat-window.module.css", import.meta.url), "utf8");
  assert.doesNotMatch(css, /\.responseSpacer\s*\{[^}]*transition:\s*height/s);
  const createElement = domDocument.createElement.bind(domDocument);
  domDocument.createElement = (tag) => {
    const element = createElement(tag);
    element.style.setProperty = (name, value) => { element.style[name] = value; };
    return element;
  };
  const previousResize = globalThis.ResizeObserver;
  const previousFrame = globalThis.requestAnimationFrame;
  const previousCancel = globalThis.cancelAnimationFrame;
  const previousWindowFrame = domWindow.requestAnimationFrame;
  const previousWindowCancel = domWindow.cancelAnimationFrame;
  let resize;
  const frames = new Map();
  let frameId = 0;
  globalThis.ResizeObserver = class {
    constructor(callback) { resize = callback; }
    observe() {}
    disconnect() {}
  };
  domWindow.requestAnimationFrame = globalThis.requestAnimationFrame = (callback) => {
    frames.set(++frameId, callback);
    return frameId;
  };
  domWindow.cancelAnimationFrame = globalThis.cancelAnimationFrame = (id) => frames.delete(id);
  const tick = async (at) => {
    const [id, callback] = frames.entries().next().value;
    frames.delete(id);
    await React.act(async () => callback(at));
  };
  const container = domDocument.createElement("div");
  container.clientHeight = 600;
  container.scrollHeight = 2000;
  container.scrollTop = 1200;
  let view;
  try {
    view = await mount(React.createElement(ActiveTurnResponseSpacer, {
      active: true, scrollContainerRef: { current: container }, onConsumed() {},
    }));
    const spacer = view.container.querySelector("[data-response-spacer]");
    await tick(0);
    await tick(500);
    assert.equal(spacer.style["--ui-response-spacer-height"], "360px");
    container.clientHeight = 700;
    resize();
    assert.equal(frames.size, 1, "resize schedules one measurement frame");
    await tick(0);
    assert.equal(spacer.style["--ui-response-spacer-height"], "360px");
    const springFrame = frames.keys().next().value;
    container.clientHeight = 690;
    resize();
    const [measurementId, measure] = [...frames.entries()].at(-1);
    frames.delete(measurementId);
    await React.act(async () => measure(0));
    assert.deepEqual([...frames.keys()], [springFrame], "a 10 px target change keeps the current spring");
    await tick(0);
    await tick(250);
    const midpoint = Number.parseFloat(spacer.style["--ui-response-spacer-height"]);
    assert.ok(midpoint > 440 && midpoint < 460, `spring midpoint ${midpoint}`);
    await tick(500);
    assert.equal(spacer.style["--ui-response-spacer-height"], "460px");
    assert.equal(frames.size, 0);
  } finally {
    await view?.unmount();
    domDocument.createElement = createElement;
    globalThis.ResizeObserver = previousResize;
    globalThis.requestAnimationFrame = previousFrame;
    globalThis.cancelAnimationFrame = previousCancel;
    domWindow.requestAnimationFrame = previousWindowFrame;
    domWindow.cancelAnimationFrame = previousWindowCancel;
  }
});

test("the spacer uses viewport height after scroll padding", async () => {
  setReducedMotion(true);
  const createElement = domDocument.createElement.bind(domDocument);
  const previousComputedStyle = domWindow.getComputedStyle;
  domDocument.createElement = (tag) => {
    const element = createElement(tag);
    element.style.setProperty = (name, value) => { element.style[name] = value; };
    return element;
  };
  domWindow.getComputedStyle = () => ({ scrollPaddingBottom: "40px" });
  const container = domDocument.createElement("div");
  container.clientHeight = 600;
  container.scrollHeight = 2000;
  container.scrollTop = 1200;
  let view;
  try {
    view = await mount(React.createElement(ActiveTurnResponseSpacer, {
      active: true, scrollContainerRef: { current: container }, onConsumed() {},
    }));
    assert.equal(view.container.querySelector("[data-response-spacer]").style["--ui-response-spacer-height"], "320px");
    assert.equal(container.scrollTop, 1399);
  } finally {
    await view?.unmount();
    domDocument.createElement = createElement;
    domWindow.getComputedStyle = previousComputedStyle;
    setReducedMotion(false);
  }
});

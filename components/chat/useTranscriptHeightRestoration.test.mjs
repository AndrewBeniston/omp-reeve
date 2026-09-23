import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
import { React, mount, settle } from "../../test/dom-harness.mjs";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { useTranscriptHeightRestoration } = await jiti.import("./useTranscriptHeightRestoration.ts");

function Transcript({ sessionKey = "one", turnKey = "turn", turnHeight = 120, scrollHeight = 1200, kind = "message" }) {
  const scrollContainerRef = React.useRef(null);
  const contentRef = React.useRef(null);
  useTranscriptHeightRestoration(scrollContainerRef, contentRef, sessionKey, true);
  return React.createElement("div", {
    ref: (element) => {
      if (!element) return;
      scrollContainerRef.current = element;
      element.scrollHeight = scrollHeight;
      element.clientHeight = 400;
      if (element.scrollTop === undefined) element.scrollTop = 500;
    },
  }, React.createElement("div", { ref: contentRef },
    React.createElement("div", {
      key: turnKey,
      ...(kind === "disclosure" ? { "data-transcript-resizable-item": "" } : { "data-message-role": "assistant" }),
      ref: (element) => { if (element) element.offsetHeight = turnHeight; },
    }, "A Turn"),
  ));
}

test("a streamed Turn height change restores the reader's distance on the next frame", async () => {
  const previousObserver = globalThis.ResizeObserver;
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  let view;
  try {
    view = await mount(React.createElement(Transcript));
    const scroll = view.container.firstChild;
    assert.equal(scroll.scrollTop, 500);
    await view.render(React.createElement(Transcript, { turnHeight: 180, scrollHeight: 1260 }));
    await settle();
    assert.equal(scroll.scrollTop, 560);
  } finally {
    await view?.unmount();
    globalThis.ResizeObserver = previousObserver;
  }
});

test("disclosure expansion preserves the reader's distance", async () => {
  const previousObserver = globalThis.ResizeObserver;
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  let view;
  try {
    view = await mount(React.createElement(Transcript, { kind: "disclosure" }));
    const scroll = view.container.firstChild;
    await view.render(React.createElement(Transcript, {
      kind: "disclosure", turnHeight: 220, scrollHeight: 1300,
    }));
    await settle();
    assert.equal(scroll.scrollTop, 600);
  } finally {
    await view?.unmount();
    globalThis.ResizeObserver = previousObserver;
  }
});

test("a rendering error that reduces a Turn preserves the reader's distance", async () => {
  const previousObserver = globalThis.ResizeObserver;
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  let view;
  try {
    view = await mount(React.createElement(Transcript));
    const scroll = view.container.firstChild;
    await view.render(React.createElement(Transcript, { turnHeight: 60, scrollHeight: 1140 }));
    await settle();
    assert.equal(scroll.scrollTop, 440);
  } finally {
    await view?.unmount();
    globalThis.ResizeObserver = previousObserver;
  }
});

test("a late image height change restores the distance on the next animation frame", async () => {
  const previousObserver = globalThis.ResizeObserver;
  const previousFrame = globalThis.requestAnimationFrame;
  const previousCancel = globalThis.cancelAnimationFrame;
  let notifyResize;
  globalThis.ResizeObserver = class {
    constructor(callback) { notifyResize = callback; }
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  let view;
  try {
    view = await mount(React.createElement(Transcript));
    const scroll = view.container.firstChild;
    const turn = scroll.firstChild.firstChild;
    let nextFrame;
    globalThis.requestAnimationFrame = (callback) => { nextFrame = callback; return 1; };
    globalThis.cancelAnimationFrame = () => { nextFrame = undefined; };
    turn.offsetHeight = 180;
    scroll.scrollHeight = 1260;
    notifyResize([{ target: turn }]);
    assert.equal(scroll.scrollTop, 500);
    assert.equal(typeof nextFrame, "function");
    nextFrame();
    assert.equal(scroll.scrollTop, 560);
  } finally {
    await view?.unmount();
    globalThis.ResizeObserver = previousObserver;
    globalThis.requestAnimationFrame = previousFrame;
    globalThis.cancelAnimationFrame = previousCancel;
  }
});

test("a Session change cancels a pending restoration", async () => {
  const previousObserver = globalThis.ResizeObserver;
  const previousFrame = globalThis.requestAnimationFrame;
  const previousCancel = globalThis.cancelAnimationFrame;
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  let view;
  try {
    view = await mount(React.createElement(Transcript));
    const scroll = view.container.firstChild;
    let nextFrame;
    globalThis.requestAnimationFrame = (callback) => { nextFrame = callback; return 1; };
    globalThis.cancelAnimationFrame = () => { nextFrame = undefined; };
    await view.render(React.createElement(Transcript, { turnHeight: 180, scrollHeight: 1260 }));
    assert.equal(typeof nextFrame, "function");
    await view.render(React.createElement(Transcript, {
      sessionKey: "two", turnHeight: 180, scrollHeight: 1260,
    }));
    assert.equal(nextFrame, undefined);
    assert.equal(scroll.scrollTop, 500);
  } finally {
    await view?.unmount();
    globalThis.ResizeObserver = previousObserver;
    globalThis.requestAnimationFrame = previousFrame;
    globalThis.cancelAnimationFrame = previousCancel;
  }
});

test("a replacement Turn cancels its predecessor's pending restoration", async () => {
  const previousObserver = globalThis.ResizeObserver;
  const previousFrame = globalThis.requestAnimationFrame;
  const previousCancel = globalThis.cancelAnimationFrame;
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  let view;
  try {
    view = await mount(React.createElement(Transcript));
    const scroll = view.container.firstChild;
    let nextFrame;
    globalThis.requestAnimationFrame = (callback) => { nextFrame = callback; return 1; };
    globalThis.cancelAnimationFrame = () => { nextFrame = undefined; };
    await view.render(React.createElement(Transcript, { turnHeight: 180, scrollHeight: 1260 }));
    assert.equal(typeof nextFrame, "function");
    await view.render(React.createElement(Transcript, {
      turnKey: "replacement", turnHeight: 180, scrollHeight: 1260,
    }));
    assert.equal(nextFrame, undefined);
    assert.equal(scroll.scrollTop, 500);
  } finally {
    await view?.unmount();
    globalThis.ResizeObserver = previousObserver;
    globalThis.requestAnimationFrame = previousFrame;
    globalThis.cancelAnimationFrame = previousCancel;
  }
});

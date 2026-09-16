import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true, moduleCache: false, tryNative: false });
const { useReviewLiveUpdates, useReviewTurnActivity } = await jiti.import("./useReviewLiveUpdates.ts");
const { REVIEW_WATCH_UNAVAILABLE, REVIEW_WATCH_WARNING } = await jiti.import("../lib/review-watch-types.ts");

const CONTEXT = {
  tabId: "review:tab",
  owner: { projectRoot: "/project", worktreePath: "/project", sessionId: "session" },
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function createDom() {
  function HTMLElement() {}
  function HTMLIFrameElement() {}
  const listeners = new Map();
  const window = { HTMLElement, HTMLIFrameElement, getSelection() { return null; } };
  const document = {
    nodeType: 9,
    visibilityState: "visible",
    defaultView: window,
    activeElement: null,
    addEventListener(name, handler) { listeners.set(name, [...(listeners.get(name) ?? []), handler]); },
    removeEventListener(name, handler) { listeners.set(name, (listeners.get(name) ?? []).filter((one) => one !== handler)); },
  };
  const container = {
    nodeType: 1, nodeName: "DIV", tagName: "DIV",
    namespaceURI: "http://www.w3.org/1999/xhtml",
    ownerDocument: document,
    addEventListener() {}, removeEventListener() {},
    appendChild() {}, removeChild() {}, textContent: "",
  };
  window.document = document;
  document.documentElement = container;
  return { window, document, container, listeners };
}

/** Every stream the hook opened, so a test can answer one and close another. */
function createEventSourceClass(opened) {
  return class FakeEventSource {
    constructor(url) {
      this.url = url;
      this.closed = false;
      this.onmessage = null;
      this.onerror = null;
      opened.push(this);
    }
    close() { this.closed = true; }
    emit(event) { this.onmessage?.({ data: JSON.stringify(event) }); }
    fail() { this.onerror?.(new Error("stream lost")); }
  };
}

async function mount({ active = true } = {}) {
  const previous = {
    document: globalThis.document, window: globalThis.window,
    EventSource: globalThis.EventSource, actEnvironment: globalThis.IS_REACT_ACT_ENVIRONMENT,
  };
  const dom = createDom();
  const opened = [];
  const invalidations = [];
  globalThis.document = dom.document;
  globalThis.window = dom.window;
  globalThis.EventSource = createEventSourceClass(opened);
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let current;

  function Probe({ watching }) {
    current = useReviewLiveUpdates({
      context: CONTEXT,
      active: watching,
      onInvalidate: (event) => { invalidations.push(event); },
    });
    return null;
  }

  const root = createRoot(dom.container);
  const render = (watching) => act(async () => {
    root.render(React.createElement(Probe, { watching }));
  });
  await render(active);
  return {
    dom, opened, invalidations, render,
    get current() { return current; },
    get stream() { return opened[opened.length - 1]; },
    /** Let the hook's debounce run out and its refresh callback settle. */
    async settle() { await act(async () => { await delay(320); }); },
    async cleanup() {
      await act(async () => root.unmount());
      globalThis.document = previous.document;
      globalThis.window = previous.window;
      globalThis.EventSource = previous.EventSource;
      globalThis.IS_REACT_ACT_ENVIRONMENT = previous.actEnvironment;
    },
  };
}

test("an opened stream carries the owner, and asks for one read when it is ready", async (t) => {
  const mounted = await mount();
  t.after(() => mounted.cleanup());

  assert.equal(mounted.opened.length, 1);
  const url = new URL(mounted.stream.url, "http://localhost");
  assert.equal(url.pathname, "/api/git/review/events");
  assert.equal(url.searchParams.get("cwd"), "/project");
  assert.equal(url.searchParams.get("tabId"), "review:tab");
  assert.equal(mounted.current.status, "connecting");

  await act(async () => mounted.stream.emit({ type: "ready", limited: false }));
  assert.equal(mounted.current.status, "watching");
  assert.equal(mounted.current.warning, null);
  await mounted.settle();
  assert.deepEqual(mounted.invalidations, [{ cwd: "/project", reason: "connected" }]);
});

test("changes on disk are collapsed into one read", async (t) => {
  const mounted = await mount();
  t.after(() => mounted.cleanup());
  await act(async () => mounted.stream.emit({ type: "ready", limited: false }));
  await mounted.settle();
  mounted.invalidations.length = 0;

  await act(async () => {
    mounted.stream.emit({ type: "change", limited: false });
    mounted.stream.emit({ type: "change", limited: false });
    mounted.stream.emit({ type: "change", limited: false });
  });
  await mounted.settle();
  assert.deepEqual(mounted.invalidations, [{ cwd: "/project", reason: "change" }]);
});

test("lost coverage is stated without reading the diff again", async (t) => {
  const mounted = await mount();
  t.after(() => mounted.cleanup());
  await act(async () => mounted.stream.emit({ type: "ready", limited: false }));
  await mounted.settle();
  mounted.invalidations.length = 0;

  await act(async () => mounted.stream.emit({ type: "status", limited: true }));
  assert.equal(mounted.current.status, "limited");
  assert.equal(mounted.current.warning, REVIEW_WATCH_WARNING);
  await mounted.settle();
  assert.deepEqual(mounted.invalidations, [], "a coverage report is not a change on disk");
});

test("a stream that never carried an event says watching is unavailable", async (t) => {
  const mounted = await mount();
  t.after(() => mounted.cleanup());

  await act(async () => mounted.stream.fail());
  assert.equal(mounted.current.status, "unavailable");
  assert.equal(mounted.current.warning, REVIEW_WATCH_UNAVAILABLE);

  await act(async () => mounted.stream.emit({ type: "ready", limited: false }));
  assert.equal(mounted.current.status, "watching");
  await act(async () => mounted.stream.fail());
  assert.equal(mounted.current.status, "limited", "a stream that worked once is a partial loss, not an absence");
});

test("watching stops with the Tab, and the stream is closed", async (t) => {
  const mounted = await mount();
  t.after(() => mounted.cleanup());
  await act(async () => mounted.stream.emit({ type: "ready", limited: false }));
  await mounted.settle();
  const stream = mounted.stream;
  mounted.invalidations.length = 0;

  await mounted.render(false);
  assert.equal(stream.closed, true);
  assert.equal(mounted.current.status, "inactive");
  assert.equal(mounted.current.warning, null);
  await act(async () => stream.emit({ type: "change", limited: false }));
  await mounted.settle();
  assert.deepEqual(mounted.invalidations, [], "a closed stream cannot refresh a Tab that stopped watching");
});

test("a hidden Tab neither reads nor holds a stream open, and catches up when it returns", async (t) => {
  const mounted = await mount();
  t.after(() => mounted.cleanup());
  await act(async () => mounted.stream.emit({ type: "ready", limited: false }));
  await mounted.settle();
  const first = mounted.stream;
  mounted.invalidations.length = 0;

  mounted.dom.document.visibilityState = "hidden";
  await act(async () => {
    for (const handler of mounted.dom.listeners.get("visibilitychange") ?? []) handler();
  });
  assert.equal(first.closed, true);
  assert.equal(mounted.current.status, "inactive");

  mounted.dom.document.visibilityState = "visible";
  await act(async () => {
    for (const handler of mounted.dom.listeners.get("visibilitychange") ?? []) handler();
  });
  const second = mounted.stream;
  assert.notEqual(second, first);
  await act(async () => second.emit({ type: "ready", limited: true }));
  assert.equal(mounted.current.status, "limited");
  await mounted.settle();
  assert.deepEqual(mounted.invalidations, [{ cwd: "/project", reason: "connected" }],
    "a Tab that was away reads the changes it could not be told about");
});

async function mountTurnActivity({ sessionId = "session", active = true } = {}) {
  const previous = {
    document: globalThis.document, window: globalThis.window,
    EventSource: globalThis.EventSource, actEnvironment: globalThis.IS_REACT_ACT_ENVIRONMENT,
  };
  const dom = createDom();
  const opened = [];
  const activity = [];
  globalThis.document = dom.document;
  globalThis.window = dom.window;
  globalThis.EventSource = createEventSourceClass(opened);
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  function Probe({ watching, session }) {
    useReviewTurnActivity({ sessionId: session, active: watching, onActivity: () => activity.push(Date.now()) });
    return null;
  }

  const root = createRoot(dom.container);
  const render = (watching, session) => act(async () => {
    root.render(React.createElement(Probe, { watching, session }));
  });
  await render(active, sessionId);
  return {
    opened, activity, render,
    get stream() { return opened[opened.length - 1]; },
    async running(ids) { await act(async () => this.stream.emit({ type: "running", runningSessionIds: ids })); },
    async cleanup() {
      await act(async () => root.unmount());
      globalThis.document = previous.document;
      globalThis.window = previous.window;
      globalThis.EventSource = previous.EventSource;
      globalThis.IS_REACT_ACT_ENVIRONMENT = previous.actEnvironment;
    },
  };
}

test("a Session that starts or finishes a prompt is worth reading again", async (t) => {
  const mounted = await mountTurnActivity();
  t.after(() => mounted.cleanup());
  assert.equal(mounted.opened.length, 1);
  assert.equal(mounted.stream.url, "/api/agent/running/events");

  // The first frame is the catch-up: a turn may have been recorded while this
  // Tab was showing another scope.
  await mounted.running([]);
  assert.equal(mounted.activity.length, 1);

  await mounted.running([]);
  assert.equal(mounted.activity.length, 1, "the same state is not a run that changed");

  await mounted.running(["session"]);
  assert.equal(mounted.activity.length, 2, "a prompt started");
  await mounted.running(["session", "another"]);
  assert.equal(mounted.activity.length, 2, "another Session running is not this one changing");
  await mounted.running(["another"]);
  assert.equal(mounted.activity.length, 3, "the prompt settled");
});

test("a Tab with no Session, or one that stopped watching, opens no stream", async (t) => {
  const mounted = await mountTurnActivity({ sessionId: null });
  t.after(() => mounted.cleanup());
  assert.deepEqual(mounted.opened, []);

  await mounted.render(true, "session");
  const stream = mounted.stream;
  assert.equal(Boolean(stream), true);
  await mounted.render(false, "session");
  assert.equal(stream.closed, true);
  assert.deepEqual(mounted.activity, []);
});

import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { startExpansionScrollAnchor } = await jiti.import("./expansion-scroll-anchor.ts");

function createHarness() {
  let top = 100;
  let now = 0;
  let frame = null;
  let timeout = null;
  let resize = null;
  const events = {};
  const scrolled = [];
  const original = {
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    performance: globalThis.performance,
  };
  globalThis.performance = { now: () => now };
  globalThis.requestAnimationFrame = (callback) => { frame = callback; return 1; };
  globalThis.cancelAnimationFrame = () => { frame = null; };
  globalThis.setTimeout = (callback, delay) => { timeout = { callback, delay }; return 2; };
  globalThis.clearTimeout = () => { timeout = null; };
  globalThis.document = { addEventListener: (name, listener) => { events[name] = listener; }, removeEventListener: (name) => { delete events[name]; } };
  globalThis.getComputedStyle = () => ({ overflowY: "visible" });
  globalThis.window = {
    scrollBy: (x, y) => scrolled.push([x, y]),
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  };
  globalThis.ResizeObserver = class {
    constructor(callback) { resize = callback; }
    observe() {}
    disconnect() {}
  };
  return {
    row: { getBoundingClientRect: () => ({ top }) },
    turn: {},
    events,
    scrolled,
    setTop(value) { top = value; },
    runFrame() { const callback = frame; frame = null; if (callback) callback(now); },
    runResize() { resize([]); },
    runTimeout() { const callback = timeout.callback; timeout = null; callback(); },
    get timeout() { return timeout; },
    restore() { Object.assign(globalThis, original); },
  };
}

test("keeps a divider at its recorded top on frames and turn resizes for 350 ms", () => {
  const h = createHarness();
  try {
    const stop = startExpansionScrollAnchor(h.row, h.turn);
    h.setTop(130); h.runFrame();
    assert.deepEqual(h.scrolled, [[0, 30]]);
    h.setTop(160); h.runResize();
    assert.deepEqual(h.scrolled, [[0, 30], [0, 60]]);
    assert.equal(h.timeout.delay, 350);
    h.runTimeout(); h.setTop(200); h.runFrame();
    assert.equal(h.scrolled.length, 2);
    stop();
  } finally { h.restore(); }
});

test("abandons correction immediately for any listed user input", () => {
  for (const name of ["wheel", "touchmove", "pointerdown", "keydown"]) {
    const h = createHarness();
    try {
      startExpansionScrollAnchor(h.row, h.turn);
      h.setTop(150);
      h.events[name]();
      h.runFrame();
      assert.deepEqual(h.scrolled, []);
    } finally { h.restore(); }
  }
});

test("corrects the nearest scrolling transcript container", () => {
  const h = createHarness();
  const transcript = { scrollTop: 40, parentElement: null, overflowY: "auto" };
  h.row.parentElement = transcript;
  globalThis.getComputedStyle = (element) => element === transcript ? { overflowY: "auto" } : { overflowY: "visible" };
  try {
    startExpansionScrollAnchor(h.row, h.turn);
    h.setTop(180);
    h.runFrame();
    assert.equal(transcript.scrollTop, 120);
    assert.deepEqual(h.scrolled, []);
  } finally { h.restore(); }
});

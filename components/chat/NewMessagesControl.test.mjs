import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

import { DomEvent, React, click, domDocument, domWindow, mount, setReducedMotion, tabbable, textOf } from "../../test/dom-harness.mjs";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { NewMessagesControl } = await jiti.import("./NewMessagesControl.tsx");
const { I18nProvider } = await jiti.import("../../hooks/useI18n.tsx");
const { useTranscriptFollow } = await jiti.import("./useTranscriptFollow.ts");

const h = React.createElement;

function mountControl(props) {
  return mount(h(I18nProvider, null, h(NewMessagesControl, { onGoToNewest() {}, ...props })));
}

test("keeps a hidden control in place while the transcript follows", async () => {
  const view = await mountControl({ mode: "user_follow", button: { visible: false, workingDots: false } });

  const button = view.container.querySelector("button");
  assert.ok(button);
  assert.equal(button.getAttribute("aria-hidden"), "true");
  assert.equal(button.getAttribute("tabindex"), "-1");
  assert.deepEqual(tabbable(view.container), []);

  await view.unmount();
});

test("hides a stale button state while the transcript follows", async () => {
  const view = await mountControl({ mode: "prework_follow", button: { visible: true, workingDots: true } });
  assert.equal(view.container.querySelector("button").getAttribute("aria-hidden"), "true");
  await view.unmount();
});

test("shows an arrow while a detached transcript is idle", async () => {
  const view = await mountControl({ mode: "static", button: { visible: true, workingDots: false } });

  assert.ok(view.container.querySelector("button").querySelector("svg"));

  await view.unmount();
});

test("appears when the stream continues and the transcript is detached", async () => {
  const view = await mountControl({ mode: "prework_watch", button: { visible: true, workingDots: true } });
  const region = view.container.querySelector("[role='status']");
  const button = view.container.querySelector("button");

  assert.ok(region, "the control sits in a live region");
  assert.equal(region.getAttribute("aria-live"), "polite");
  assert.ok(region.contains(button));
  assert.equal(button.querySelector("span").querySelectorAll("span").length, 3);
  // The name states the event and the action, so a screen reader is clear.
  assert.equal(button.getAttribute("aria-label"), "Scroll to bottom");
  assert.equal(textOf(button), "");

  await view.unmount();
});

test("reaches the control with the keyboard and runs the action", async () => {
  const calls = [];
  const view = await mountControl({
    mode: "static",
    button: { visible: true, workingDots: true },
    onGoToNewest: () => calls.push("go"),
  });
  const button = view.container.querySelector("button");

  assert.deepEqual(tabbable(view.container), [button], "the control is the one tab stop");
  button.focus();
  assert.equal(domDocument.activeElement, button);

  // React maps Enter and Space on a button to a click.
  await click(button);
  assert.deepEqual(calls, ["go"]);
  assert.notEqual(domDocument.activeElement, button);

  await view.unmount();
});

test("hides the same control once the reader returns to the newest content", async () => {
  const view = await mountControl({ mode: "static", button: { visible: true, workingDots: true } });
  const button = view.container.querySelector("button");
  assert.ok(button);

  await view.render(h(I18nProvider, null, h(NewMessagesControl, {
    mode: "user_follow",
    button: { visible: false, workingDots: false },
    onGoToNewest() {},
  })));

  assert.equal(view.container.querySelector("button"), button);
  assert.equal(button.getAttribute("aria-hidden"), "true");
  assert.equal(button.getAttribute("tabindex"), "-1");

  await view.unmount();
});

test("carries no decorative graphic into the accessible name", async () => {
  const view = await mountControl({ mode: "static", button: { visible: true, workingDots: true } });
  const graphic = view.container.querySelector("button").querySelector("span");

  assert.equal(graphic.getAttribute("aria-hidden"), "true");

  await view.unmount();
});

async function mountScrollingControl({ distance = 500, reducedMotion = false } = {}) {
  setReducedMotion(reducedMotion);
  let scroll;
  const moves = [];
  function Conversation() {
    const scrollContainerRef = React.useRef(null);
    const contentRef = React.useRef(null);
    const follow = useTranscriptFollow({
      scrollContainerRef, contentRef, phase: "idle", working: false,
      activeTurnHeld: false, contentChange: null, messageCount: 0,
      sessionKey: "scroll-control-test", onGoToNewest() {},
    });
    return h(I18nProvider, null,
      h("div", { ref(node) {
        if (!node || scroll) return;
        scroll = node;
        scrollContainerRef.current = node;
        node.clientHeight = 600;
        node.scrollHeight = 1600;
        node.scrollTop = 1000 - distance;
        node.scrollTo = ({ top, behavior }) => {
          moves.push({ top, behavior });
          node.scrollTop = Math.min(1000, top);
        };
      } }, h("div", { ref(node) {
        contentRef.current = node;
        if (node) node.getBoundingClientRect = () => ({ height: 100 });
      } })),
      h(NewMessagesControl, {
        mode: follow.mode, button: follow.button, onGoToNewest: follow.goToNewest,
      }),
    );
  }
  const view = await mount(h(Conversation));
  await React.act(async () => scroll.dispatchEvent(new DomEvent("scroll")));
  return { view, scroll, moves, button: view.container.querySelector("button") };
}

test("a press uses cubic motion and stops inside the 24 px band", async () => {
  const previousFrame = globalThis.requestAnimationFrame;
  const previousCancel = globalThis.cancelAnimationFrame;
  const previousWindowFrame = domWindow.requestAnimationFrame;
  const previousWindowCancel = domWindow.cancelAnimationFrame;
  const frames = new Map();
  let nextId = 0;
  let mounted;
  try {
    mounted = await mountScrollingControl();
    domWindow.requestAnimationFrame = globalThis.requestAnimationFrame = (callback) => {
      frames.set(++nextId, callback);
      return nextId;
    };
    domWindow.cancelAnimationFrame = globalThis.cancelAnimationFrame = (id) => frames.delete(id);
    const tick = (at) => {
      const [id, callback] = frames.entries().next().value;
      frames.delete(id);
      callback(at);
    };

    await click(mounted.button);
    assert.equal(frames.size, 1);
    tick(0);
    tick(130);
    assert.equal(mounted.scroll.scrollTop, 937.5);
    assert.ok(mounted.moves.every((move) => move.behavior !== "smooth"));
    tick(200);
    assert.ok(1000 - mounted.scroll.scrollTop <= 24);
    assert.equal(frames.size, 0, "the motion ends on entry to the bottom band");
  } finally {
    await mounted?.view.unmount();
    globalThis.requestAnimationFrame = previousFrame;
    globalThis.cancelAnimationFrame = previousCancel;
    domWindow.requestAnimationFrame = previousWindowFrame;
    domWindow.cancelAnimationFrame = previousWindowCancel;
    setReducedMotion(false);
  }
});

for (const [reason, prepare] of [
  ["reduced motion", () => {}],
  ["an existing distance of 24 px", (scroll) => { scroll.scrollTop = 976; }],
]) {
  test(`a press moves instantly with ${reason}`, async () => {
    const previousFrame = domWindow.requestAnimationFrame;
    let mounted;
    try {
      mounted = await mountScrollingControl({ reducedMotion: reason === "reduced motion" });
      prepare(mounted.scroll);
      domWindow.requestAnimationFrame = () => { throw new Error("unexpected animation frame"); };
      await click(mounted.button);
      assert.equal(mounted.scroll.scrollTop, 1000);
      assert.deepEqual(mounted.moves, [{ top: 1600, behavior: "instant" }]);
    } finally {
      await mounted?.view.unmount();
      domWindow.requestAnimationFrame = previousFrame;
      globalThis.requestAnimationFrame = previousFrame;
      setReducedMotion(false);
    }
  });
}

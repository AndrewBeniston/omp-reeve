import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
import { domWindow, React, mount, settle } from "../../test/dom-harness.mjs";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { readTranscriptOffset, writeTranscriptOffset } = await jiti.import("../../lib/transcript-scroll-offset.ts");
const { useTranscriptFollow } = await jiti.import("./useTranscriptFollow.ts");

function Transcript({
  sessionId = "session-a", scrollHeight = 2000, clientHeight = 400,
  messageCount = 20, origin = "bottom", compact = false, preserve = true,
  footerHeight = 80, onNeedHistory = () => false,
  historyVersion = 0,
}) {
  const scrollContainerRef = React.useRef(null);
  const contentRef = React.useRef(null);
  const footerRef = React.useRef(null);
  const follow = useTranscriptFollow({
    scrollContainerRef, contentRef, footerRef,
    phase: "idle", working: false, activeTurnHeld: false,
    contentChange: null, messageCount,
    sessionKey: sessionId, sessionId, layoutReady: true,
    origin, compactPresentation: compact, preserveFooterPosition: preserve,
    onNeedHistory,
    historyVersion,
    onGoToNewest: () => {},
  });
  return React.createElement("div", null,
    React.createElement("div", {
      "data-scroll": "",
      ref: (element) => {
        if (!element) return;
        scrollContainerRef.current = element;
        element.scrollHeight = scrollHeight;
        element.clientHeight = clientHeight;
        if (element.scrollTop === undefined) element.scrollTop = 0;
        element.style.setProperty = (name, value) => { element.style[name] = value; };
        element.scrollTo = ({ top }) => {
          element.scrollTop = Math.max(0, Math.min(top, element.scrollHeight - element.clientHeight));
          element.dispatchEvent(new Event("scroll"));
        };
      },
    }, React.createElement("div", {
      ref: (element) => {
        contentRef.current = element;
        if (element) element.getBoundingClientRect = () => ({ height: scrollHeight });
      },
    }, "A long Session")),
    React.createElement("div", {
      "data-footer": "",
      ref: (element) => {
        footerRef.current = element;
        if (element) element.getBoundingClientRect = () => ({ height: footerHeight });
      },
    }, React.createElement("textarea")),
    React.createElement("span", { "data-mode": follow.mode }),
  );
}

test("saved reading distances survive a reload and stay isolated by Session id", () => {
  const storage = domWindow.localStorage;
  storage.clear();
  writeTranscriptOffset(storage, "session-a", 640);
  writeTranscriptOffset(storage, "session-b", 135);

  assert.equal(readTranscriptOffset(storage, "session-a"), 640);
  assert.equal(readTranscriptOffset(storage, "session-b"), 135);
  assert.equal(readTranscriptOffset(storage, "missing-session"), null);
  const savedKey = [...storage.entries.keys()].find((key) => key.endsWith(":session-a"));
  assert.match(savedKey, /:v1:session-a$/);
  storage.setItem(savedKey, JSON.stringify({ version: 2, distanceFromEnd: 640 }));
  assert.equal(readTranscriptOffset(storage, "session-a"), null);
});

test("a long Session restores its saved distance after the layout settles", async () => {
  domWindow.localStorage.clear();
  writeTranscriptOffset(domWindow.localStorage, "session-a", 620);
  let view;
  try {
    view = await mount(React.createElement(Transcript));
    const scroll = view.container.querySelector("[data-scroll]");
    assert.equal(scroll.scrollTop, 0, "restoration waits for a stable layout");
    await settle(6);
    assert.equal(scroll.scrollTop, 980);
    assert.equal(view.container.querySelector("[data-mode]").getAttribute("data-mode"), "static");
  } finally {
    await view?.unmount();
  }
});

test("restoration uses the layout after its height stops changing", async () => {
  domWindow.localStorage.clear();
  writeTranscriptOffset(domWindow.localStorage, "session-a", 620);
  let view;
  try {
    view = await mount(React.createElement(Transcript));
    const scroll = view.container.querySelector("[data-scroll]");
    scroll.scrollHeight = 3000;
    await settle(6);
    assert.equal(scroll.scrollTop, 1980);
  } finally {
    await view?.unmount();
  }
});

test("a saved distance inside the 24 px band opens at the end", async () => {
  domWindow.localStorage.clear();
  writeTranscriptOffset(domWindow.localStorage, "session-a", 24);
  let view;
  try {
    view = await mount(React.createElement(Transcript));
    await settle(6);
    assert.equal(view.container.querySelector("[data-scroll]").scrollTop, 1600);
    assert.equal(view.container.querySelector("[data-mode]").getAttribute("data-mode"), "user_follow");
  } finally {
    await view?.unmount();
  }
});

test("a clamped restore inside the 24 px band follows the end", async () => {
  domWindow.localStorage.clear();
  writeTranscriptOffset(domWindow.localStorage, "session-a", 620);
  let view;
  try {
    view = await mount(React.createElement(Transcript, { scrollHeight: 420 }));
    await settle(6);
    assert.equal(view.container.querySelector("[data-scroll]").scrollTop, 20);
    assert.equal(view.container.querySelector("[data-mode]").getAttribute("data-mode"), "user_follow");
  } finally {
    await view?.unmount();
  }
});

test("the top origin opens at the top and a missing Session ignores saved offsets", async () => {
  domWindow.localStorage.clear();
  writeTranscriptOffset(domWindow.localStorage, "session-a", 620);
  let topView;
  let missingView;
  try {
    topView = await mount(React.createElement(Transcript, { origin: "top" }));
    missingView = await mount(React.createElement(Transcript, { sessionId: null }));
    await settle(6);
    assert.equal(topView.container.querySelector("[data-scroll]").scrollTop, 0);
    assert.equal(missingView.container.querySelector("[data-scroll]").scrollTop, 1600);
  } finally {
    await topView?.unmount();
    await missingView?.unmount();
  }
});

test("the top origin stays at the top when its short content is inside the end band", async () => {
  domWindow.localStorage.clear();
  let view;
  try {
    view = await mount(React.createElement(Transcript, { origin: "top", scrollHeight: 420 }));
    await settle(6);
    assert.equal(view.container.querySelector("[data-scroll]").scrollTop, 0);
  } finally {
    await view?.unmount();
  }
});

test("restoration loads earlier history until the saved distance fits", async () => {
  domWindow.localStorage.clear();
  writeTranscriptOffset(domWindow.localStorage, "session-a", 620);
  let requests = 0;
  function PagedTranscript() {
    const [page, setPage] = React.useState(0);
    return React.createElement(Transcript, {
      scrollHeight: page === 0 ? 800 : 1600,
      historyVersion: page,
      onNeedHistory: () => {
        if (page !== 0) return false;
        requests += 1;
        setPage(1);
        return true;
      },
    });
  }
  let view;
  try {
    view = await mount(React.createElement(PagedTranscript));
    await settle(10);
    assert.equal(requests, 1);
    assert.equal(view.container.querySelector("[data-scroll]").scrollTop, 580);
  } finally {
    await view?.unmount();
  }
});

test("Session switching restores each distance without overwriting the other Session", async () => {
  domWindow.localStorage.clear();
  writeTranscriptOffset(domWindow.localStorage, "session-a", 620);
  writeTranscriptOffset(domWindow.localStorage, "session-b", 300);
  let view;
  try {
    view = await mount(React.createElement(Transcript, { sessionId: "session-a" }));
    await settle(6);
    assert.equal(view.container.querySelector("[data-scroll]").scrollTop, 980);
    await view.render(React.createElement(Transcript, { sessionId: "session-b" }));
    await settle(6);
    assert.equal(view.container.querySelector("[data-scroll]").scrollTop, 1300);
    assert.equal(readTranscriptOffset(domWindow.localStorage, "session-a"), 620);
  } finally {
    await view?.unmount();
  }
});

test("two open Sessions keep separate reading distances", async () => {
  domWindow.localStorage.clear();
  writeTranscriptOffset(domWindow.localStorage, "session-a", 620);
  writeTranscriptOffset(domWindow.localStorage, "session-b", 300);
  let first;
  let second;
  try {
    first = await mount(React.createElement(Transcript, { sessionId: "session-a" }));
    second = await mount(React.createElement(Transcript, { sessionId: "session-b" }));
    await settle(6);
    assert.equal(first.container.querySelector("[data-scroll]").scrollTop, 980);
    assert.equal(second.container.querySelector("[data-scroll]").scrollTop, 1300);
    await React.act(async () => {
      const scroll = first.container.querySelector("[data-scroll]");
      scroll.scrollTop = 700;
      scroll.dispatchEvent(new Event("scroll"));
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(readTranscriptOffset(domWindow.localStorage, "session-a"), 900);
    assert.equal(readTranscriptOffset(domWindow.localStorage, "session-b"), 300);
  } finally {
    await first?.unmount();
    await second?.unmount();
  }
});

test("scroll changes write only after scrolling settles", async () => {
  domWindow.localStorage.clear();
  let view;
  try {
    view = await mount(React.createElement(Transcript));
    await settle(6);
    const scroll = view.container.querySelector("[data-scroll]");
    await React.act(async () => {
      scroll.scrollTop = 1000;
      scroll.dispatchEvent(new Event("scroll"));
      scroll.scrollTop = 900;
      scroll.dispatchEvent(new Event("scroll"));
    });
    assert.equal(readTranscriptOffset(domWindow.localStorage, "session-a"), null);
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(readTranscriptOffset(domWindow.localStorage, "session-a"), 700);
  } finally {
    await view?.unmount();
  }
});

test("a user scroll cancels a pending restore", async () => {
  domWindow.localStorage.clear();
  writeTranscriptOffset(domWindow.localStorage, "session-a", 620);
  let view;
  try {
    view = await mount(React.createElement(Transcript));
    const scroll = view.container.querySelector("[data-scroll]");
    await React.act(async () => {
      scroll.dispatchEvent(new Event("wheel", { deltaY: -120, deltaMode: 0 }));
      scroll.scrollTop = 800;
      scroll.dispatchEvent(new Event("scroll"));
    });
    await settle(6);
    assert.equal(scroll.scrollTop, 800);
  } finally {
    await view?.unmount();
  }
});

async function withResizeObserver(run) {
  const previousObserver = globalThis.ResizeObserver;
  const callbacks = new Map();
  globalThis.ResizeObserver = class {
    constructor(callback) { this.callback = callback; }
    observe(element) { callbacks.set(element, this.callback); }
    unobserve(element) { callbacks.delete(element); }
    disconnect() {
      for (const [element, callback] of callbacks) {
        if (callback === this.callback) callbacks.delete(element);
      }
    }
  };
  try {
    await run((element) => callbacks.get(element)?.([{ target: element }]));
  } finally {
    globalThis.ResizeObserver = previousObserver;
  }
}

test("footer padding uses the measured height in default and compact presentation", async () => {
  await withResizeObserver(async () => {
    let standard;
    let compact;
    try {
      standard = await mount(React.createElement(Transcript));
      compact = await mount(React.createElement(Transcript, { sessionId: "session-b", compact: true }));
      assert.equal(standard.container.querySelector("[data-scroll]").style["--transcript-scroll-padding-bottom"], "96px");
      assert.equal(compact.container.querySelector("[data-scroll]").style["--transcript-scroll-padding-bottom"], "80px");
    } finally {
      await standard?.unmount();
      await compact?.unmount();
    }
  });
});

test("focus inside the footer sets scroll padding to zero", async () => {
  await withResizeObserver(async () => {
    let view;
    try {
      view = await mount(React.createElement(Transcript));
      const scroll = view.container.querySelector("[data-scroll]");
      const input = view.container.querySelector("textarea");
      await React.act(async () => { input.focus(); });
      assert.equal(scroll.style["--transcript-scroll-padding-bottom"], "0px");
      await React.act(async () => { input.blur(); });
      await settle(3);
      assert.equal(scroll.style["--transcript-scroll-padding-bottom"], "96px");
    } finally {
      await view?.unmount();
    }
  });
});

test("footer growth preserves a detached reading position", async () => {
  await withResizeObserver(async (notify) => {
    let view;
    try {
      view = await mount(React.createElement(Transcript));
      await settle(6);
      const scroll = view.container.querySelector("[data-scroll]");
      scroll.scrollTop = 900;
      await view.render(React.createElement(Transcript, { footerHeight: 120, clientHeight: 360 }));
      await React.act(async () => { notify(view.container.querySelector("[data-footer]")); });
      assert.equal(scroll.scrollTop, 940);
      assert.equal(scroll.style["--transcript-scroll-padding-bottom"], "136px");
    } finally {
      await view?.unmount();
    }
  });
});

test("footer growth does not correct near the end, during user input, or with preservation disabled", async () => {
  await withResizeObserver(async (notify) => {
    for (const condition of ["near", "interrupt", "disabled"]) {
      let view;
      try {
        view = await mount(React.createElement(Transcript, { preserve: condition !== "disabled" }));
        await settle(6);
        const scroll = view.container.querySelector("[data-scroll]");
        scroll.scrollTop = condition === "near" ? 1590 : 900;
        if (condition === "interrupt") {
          await React.act(async () => {
            scroll.dispatchEvent(new Event("wheel", { deltaY: -40, deltaMode: 0 }));
          });
        }
        await view.render(React.createElement(Transcript, {
          footerHeight: 120, clientHeight: 360, preserve: condition !== "disabled",
        }));
        await React.act(async () => { notify(view.container.querySelector("[data-footer]")); });
        assert.equal(scroll.scrollTop, condition === "near" ? 1590 : 900, condition);
      } finally {
        await view?.unmount();
      }
    }
  });
});

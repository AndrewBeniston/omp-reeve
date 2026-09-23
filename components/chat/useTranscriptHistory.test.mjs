import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
import { React, mount, settle } from "../../test/dom-harness.mjs";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { useTranscriptHistory, fetchSessionHistoryPage } = await jiti.import("./useTranscriptHistory.ts");

function History({ sessionKey = "a", sessionId = null, paged = false, loadPage, total = 150, grow = true, heightPerMessage = 10, autoLoadOnMount = false, initialTop = 200 }) {
  const containerRef = React.useRef(null);
  const history = useTranscriptHistory({ containerRef, sessionKey, sessionId, pagedHiddenHistory: paged, loadPage, autoLoadOnMount });
  return React.createElement("div", {
    "data-scroll": "",
    ref: (element) => {
      if (!element) return;
      containerRef.current = element;
      element.clientHeight = 400;
      element.scrollHeight = grow ? 1000 + Math.min(history.visibleCount, total) * heightPerMessage : 1500;
      if (!element.dataset.ready) {
        element.scrollTop = initialTop;
        element.dataset.ready = "true";
      }
    },
  },
  history.visibleCount < total && React.createElement("div", { ref: history.sentinelRef, "data-sentinel": "" }),
  React.createElement("span", { "data-count": String(history.visibleCount) }),
  React.createElement("span", { "data-status": history.status }),
  React.createElement("button", { "data-reveal": "", onClick: () => history.revealAll(total) }, "Reveal"),
  history.failure?.retryable && React.createElement("button", { "data-retry": "", onClick: history.retry }, "Retry"));
}

test("scrolling within 64 px loads one 50-message page and restores the distance", async () => {
  let view;
  try {
    view = await mount(React.createElement(History));
    const scroll = view.container.querySelector("[data-scroll]");
    assert.equal(view.container.querySelector("[data-count]").getAttribute("data-count"), "50");
    await React.act(async () => {
      scroll.scrollTop = 64;
      scroll.dispatchEvent(new Event("scroll"));
    });
    await settle(3);
    assert.equal(view.container.querySelector("[data-count]").getAttribute("data-count"), "100");
    assert.equal(scroll.scrollTop, 564);
  } finally {
    await view?.unmount();
  }
});

test("a wheel up at the top loads when scrolling cannot move", async () => {
  let view;
  try {
    view = await mount(React.createElement(History));
    const scroll = view.container.querySelector("[data-scroll]");
    scroll.scrollTop = 0;
    await React.act(async () => {
      scroll.dispatchEvent(new Event("wheel", { deltaY: -30 }));
    });
    await settle(3);
    assert.equal(view.container.querySelector("[data-count]").getAttribute("data-count"), "100");
  } finally {
    await view?.unmount();
  }
});

test("a top-origin transcript loads when its initial distance is near the top", async () => {
  let view;
  try {
    view = await mount(React.createElement(History, { autoLoadOnMount: true, initialTop: 0 }));
    await settle(3);
    assert.equal(view.container.querySelector("[data-count]").getAttribute("data-count"), "100");
  } finally {
    await view?.unmount();
  }
});

test("paged history starts at one viewport and prevents duplicate requests", async () => {
  let resolvePage;
  let calls = 0;
  const loadPage = () => {
    calls += 1;
    return new Promise((resolve) => { resolvePage = resolve; });
  };
  let view;
  try {
    view = await mount(React.createElement(History, { sessionId: "a", paged: true, loadPage }));
    const scroll = view.container.querySelector("[data-scroll]");
    await React.act(async () => {
      scroll.scrollTop = 400;
      scroll.dispatchEvent(new Event("scroll"));
      scroll.dispatchEvent(new Event("scroll"));
      scroll.dispatchEvent(new Event("wheel", { deltaY: -1 }));
    });
    assert.equal(calls, 1);
    assert.equal(view.container.querySelector("[data-status]").getAttribute("data-status"), "loading");
    await React.act(async () => resolvePage({ ok: true, sessionId: "a", requestedCursor: null, entries: [], nextCursor: "older", exhausted: false }));
    await settle(3);
    assert.equal(view.container.querySelector("[data-count]").getAttribute("data-count"), "100");
  } finally {
    await view?.unmount();
  }
});

test("a failed request retains the page and exposes Retry only for retryable failures", async () => {
  let calls = 0;
  const loadPage = async () => {
    calls += 1;
    if (calls === 1) return { ok: false, sessionId: "a", cursor: null, error: { code: "read_failed", message: "Read failed", retryable: true } };
    return { ok: true, sessionId: "a", requestedCursor: null, entries: [], nextCursor: null, exhausted: true };
  };
  let view;
  try {
    view = await mount(React.createElement(History, { sessionId: "a", paged: true, loadPage }));
    const scroll = view.container.querySelector("[data-scroll]");
    await React.act(async () => {
      scroll.scrollTop = 400;
      scroll.dispatchEvent(new Event("scroll"));
    });
    await settle(3);
    assert.equal(view.container.querySelector("[data-count]").getAttribute("data-count"), "50");
    assert.equal(view.container.querySelector("[data-status]").getAttribute("data-status"), "failed");
    assert.ok(view.container.querySelector("[data-retry]"));
    await React.act(async () => view.container.querySelector("[data-retry]").click());
    await settle(3);
    assert.equal(calls, 2);
    assert.equal(view.container.querySelector("[data-count]").getAttribute("data-count"), "100");
  } finally {
    await view?.unmount();
  }
});

test("a page with no content growth stops loading", async () => {
  let view;
  try {
    view = await mount(React.createElement(History, { grow: false }));
    const scroll = view.container.querySelector("[data-scroll]");
    await React.act(async () => {
      scroll.scrollTop = 64;
      scroll.dispatchEvent(new Event("scroll"));
    });
    await settle(3);
    assert.equal(view.container.querySelector("[data-status]").getAttribute("data-status"), "exhausted");
    await React.act(async () => scroll.dispatchEvent(new Event("wheel", { deltaY: -20 })));
    assert.equal(view.container.querySelector("[data-count]").getAttribute("data-count"), "100");
  } finally {
    await view?.unmount();
  }
});

test("switching Sessions cancels an outstanding request and its restoration", async () => {
  let resolvePage;
  const loadPage = () => new Promise((resolve) => { resolvePage = resolve; });
  let view;
  try {
    view = await mount(React.createElement(History, { sessionKey: "a", sessionId: "a", paged: true, loadPage }));
    const scroll = view.container.querySelector("[data-scroll]");
    await React.act(async () => {
      scroll.scrollTop = 400;
      scroll.dispatchEvent(new Event("scroll"));
    });
    scroll.scrollTop = 500;
    await view.render(React.createElement(History, { sessionKey: "b", sessionId: "b", paged: true, loadPage }));
    await React.act(async () => resolvePage({ ok: true, sessionId: "a", requestedCursor: null, entries: [], nextCursor: null, exhausted: true }));
    await settle(3);
    assert.equal(view.container.querySelector("[data-count]").getAttribute("data-count"), "50");
    assert.equal(view.container.querySelector("[data-status]").getAttribute("data-status"), "cancelled");
    assert.equal(scroll.scrollTop, 500);
  } finally {
    await view?.unmount();
  }
});

test("the history client sends the Session, branch, and cursor and keeps a typed failure", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, signal: options.signal });
    return {
      json: async () => ({ ok: false, sessionId: "a/b", cursor: "page-2", error: {
        code: "cursor_not_found", message: "History cursor no longer exists", retryable: false,
      } }),
    };
  };
  try {
    const controller = new AbortController();
    const result = await fetchSessionHistoryPage("a/b", "page-2", "leaf-1", controller.signal);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "/api/sessions/a%2Fb/history?cursor=page-2&leafId=leaf-1");
    assert.equal(calls[0].signal, controller.signal);
    assert.equal(result.error.retryable, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a nonretryable failure does not offer Retry", async () => {
  let view;
  try {
    view = await mount(React.createElement(History, {
      sessionId: "a", paged: true,
      loadPage: async () => ({ ok: false, sessionId: "a", cursor: null, error: {
        code: "cursor_not_found", message: "Cursor missing", retryable: false,
      } }),
    }));
    const scroll = view.container.querySelector("[data-scroll]");
    await React.act(async () => {
      scroll.scrollTop = 400;
      scroll.dispatchEvent(new Event("scroll"));
    });
    await settle(3);
    assert.equal(view.container.querySelector("[data-status]").getAttribute("data-status"), "failed");
    assert.equal(view.container.querySelector("[data-retry]"), null);
  } finally {
    await view?.unmount();
  }
});

test("source exhaustion stops requests while remaining local rows stay available", async () => {
  let calls = 0;
  let view;
  try {
    view = await mount(React.createElement(History, {
      sessionId: "a", paged: true,
      loadPage: async () => {
        calls += 1;
        return { ok: true, sessionId: "a", requestedCursor: null, entries: [], nextCursor: null, exhausted: true };
      },
    }));
    const scroll = view.container.querySelector("[data-scroll]");
    await React.act(async () => {
      scroll.scrollTop = 400;
      scroll.dispatchEvent(new Event("scroll"));
    });
    await settle(3);
    assert.equal(view.container.querySelector("[data-status]").getAttribute("data-status"), "idle");
    await React.act(async () => {
      scroll.scrollTop = 400;
      scroll.dispatchEvent(new Event("scroll"));
    });
    await settle(3);
    assert.equal(view.container.querySelector("[data-count]").getAttribute("data-count"), "150");
    assert.equal(view.container.querySelector("[data-status]").getAttribute("data-status"), "exhausted");
    assert.equal(calls, 1);
  } finally {
    await view?.unmount();
  }
});

test("short pages continue until the hidden source ends", async () => {
  let view;
  try {
    view = await mount(React.createElement(History, { heightPerMessage: 0.1 }));
    const scroll = view.container.querySelector("[data-scroll]");
    scroll.scrollTop = 0;
    await React.act(async () => scroll.dispatchEvent(new Event("wheel", { deltaY: -1 })));
    await settle(8);
    assert.equal(view.container.querySelector("[data-count]").getAttribute("data-count"), "150");
    assert.equal(view.container.querySelector("[data-status]").getAttribute("data-status"), "exhausted");
  } finally {
    await view?.unmount();
  }
});

test("revealing a navigation target cancels a pending page and restoration", async () => {
  let resolvePage;
  const loadPage = () => new Promise((resolve) => { resolvePage = resolve; });
  let view;
  try {
    view = await mount(React.createElement(History, { sessionId: "a", paged: true, loadPage }));
    const scroll = view.container.querySelector("[data-scroll]");
    await React.act(async () => {
      scroll.scrollTop = 400;
      scroll.dispatchEvent(new Event("scroll"));
    });
    await React.act(async () => view.container.querySelector("[data-reveal]").click());
    scroll.scrollTop = 1000;
    await React.act(async () => resolvePage({ ok: true, sessionId: "a", requestedCursor: null, entries: [], nextCursor: null, exhausted: true }));
    await settle(3);
    assert.equal(view.container.querySelector("[data-count]").getAttribute("data-count"), "150");
    assert.equal(view.container.querySelector("[data-status]").getAttribute("data-status"), "exhausted");
    assert.equal(scroll.scrollTop, 1000);
  } finally {
    await view?.unmount();
  }
});

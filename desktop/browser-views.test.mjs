import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { browserPagePreferences, createBrowserViewRegistry, normalizeBounds } = require("./browser-views.cjs");
const { BROWSER_PARTITION } = require("./desktop-runtime.cjs");

function fakeView() {
  const view = {
    bounds: null,
    visible: true,
    loaded: [],
    setBounds(rect) { view.bounds = rect; },
    setVisible(value) { view.visible = value; },
    webContents: {
      backCalls: 0,
      forwardCalls: 0,
      reloads: 0,
      canGoBack: () => true,
      canGoForward: () => false,
      goBack() { view.webContents.backCalls += 1; },
      goForward() { view.webContents.forwardCalls += 1; },
      reload() { view.webContents.reloads += 1; },
      loadURL(url) { view.loaded.push(url); },
    },
  };
  return view;
}

function registry() {
  const created = [];
  const attached = [];
  const detached = [];
  const instance = createBrowserViewRegistry({
    createView: (preferences) => {
      const view = fakeView();
      created.push({ preferences, view });
      return view;
    },
    attach: (view, ownerId) => attached.push({ view, ownerId }),
    detach: (view, ownerId) => detached.push({ view, ownerId }),
  });
  return { instance, created, attached, detached };
}

test("a Browser page is contained exactly as the guest was", () => {
  const preferences = browserPagePreferences();

  // The page runs somebody else's code. Every one of these is what stops it
  // reaching the application.
  assert.equal(preferences.sandbox, true);
  assert.equal(preferences.contextIsolation, true);
  assert.equal(preferences.webSecurity, true);
  assert.equal(preferences.nodeIntegration, false);
  assert.equal(preferences.nodeIntegrationInSubFrames, false);
  assert.equal(preferences.nodeIntegrationInWorker, false);
  assert.equal(preferences.allowRunningInsecureContent, false);
  assert.equal(preferences.plugins, false);
  assert.equal(preferences.webviewTag, false, "a page must not be able to create a guest");

  // Never the application session: the renderer holds the desktop launch token.
  assert.equal(preferences.partition, BROWSER_PARTITION);
  assert.match(preferences.partition, /^persist:/, "a login must survive a restart");

  // A Browser tab needs no bridge. The agent reaches it over CDP from outside.
  assert.equal("preload" in preferences, false);
});

test("a rectangle that cannot be drawn is refused", () => {
  assert.deepEqual(normalizeBounds({ x: 10.4, y: 20.6, width: 300.2, height: 400.5 }), {
    x: 10, y: 21, width: 300, height: 401,
  });

  // A hidden panel measures as zero. A view given that is an invisible page.
  assert.equal(normalizeBounds({ x: 0, y: 0, width: 0, height: 400 }), null);
  assert.equal(normalizeBounds({ x: 0, y: 0, width: 300, height: 0 }), null);
  assert.equal(normalizeBounds({ x: 0, y: 0, width: -5, height: 400 }), null);
  assert.equal(normalizeBounds({ x: NaN, y: 0, width: 300, height: 400 }), null);
  assert.equal(normalizeBounds({ x: 0, y: 0, width: "wide", height: 400 }), null);
  assert.equal(normalizeBounds(null), null);
});

test("opening the same tab twice does not stack two pages on top of each other", () => {
  const { instance, created, attached } = registry();
  const bounds = { x: 400, y: 40, width: 600, height: 500 };

  const first = instance.open({ ownerId: 1, tabId: "browser:a", url: "https://example.com/", bounds });
  const second = instance.open({ ownerId: 1, tabId: "browser:a", url: "https://example.com/", bounds });

  assert.equal(first.reused, false);
  assert.equal(second.reused, true, "a remount created a second page");
  assert.equal(created.length, 1);
  assert.equal(attached.length, 1);
  assert.equal(instance.size, 1);
  assert.deepEqual(created[0].view.bounds, bounds);
  assert.deepEqual(created[0].view.loaded, ["https://example.com/"]);
});

test("a tab opened with no address rests on about:blank", () => {
  const { instance, created } = registry();
  instance.open({ ownerId: 1, tabId: "browser:a", url: "", bounds: { x: 0, y: 0, width: 10, height: 10 } });
  // A view with no page never finishes loading, so its events would not fire.
  assert.deepEqual(created[0].view.loaded, ["about:blank"]);
});

test("a bare host is a search-bar address, not a relative path", () => {
  const { instance, created } = registry();
  instance.open({ ownerId: 1, tabId: "t", url: "", bounds: { x: 0, y: 0, width: 10, height: 10 } });

  instance.navigate(1, "t", "  example.com  ");
  instance.navigate(1, "t", "https://already.example/");
  instance.navigate(1, "t", "about:blank");
  assert.equal(instance.navigate(1, "t", "   "), false, "an empty address is not a navigation");

  assert.deepEqual(created[0].view.loaded, [
    "about:blank",
    "https://example.com",
    "https://already.example/",
    "about:blank",
  ]);
});

test("one window cannot move, hide, navigate or close another window's page", () => {
  const { instance, created, detached } = registry();
  instance.open({ ownerId: 1, tabId: "t", url: "https://example.com/", bounds: { x: 0, y: 0, width: 10, height: 10 } });

  assert.equal(instance.setBounds(2, "t", { x: 0, y: 0, width: 99, height: 99 }), false);
  assert.equal(instance.setVisible(2, "t", false), false);
  assert.equal(instance.navigate(2, "t", "https://evil.example/"), false);
  assert.equal(instance.command(2, "t", "reload"), false);
  assert.equal(instance.close(2, "t"), false);

  assert.deepEqual(created[0].view.bounds, { x: 0, y: 0, width: 10, height: 10 });
  assert.deepEqual(created[0].view.loaded, ["https://example.com/"]);
  assert.equal(created[0].view.visible, true);
  assert.deepEqual(detached, []);
  assert.equal(instance.size, 1);
});

test("only the three navigation controls are commands", () => {
  const { instance, created } = registry();
  instance.open({ ownerId: 1, tabId: "t", url: "https://example.com/", bounds: { x: 0, y: 0, width: 10, height: 10 } });
  const contents = created[0].view.webContents;

  assert.equal(instance.command(1, "t", "back"), true);
  assert.equal(instance.command(1, "t", "reload"), true);
  // canGoForward is false on this page, so forward is accepted and does nothing.
  assert.equal(instance.command(1, "t", "forward"), true);
  assert.equal(instance.command(1, "t", "executeJavaScript"), false);
  assert.equal(instance.command(1, "t", "openDevTools"), false);

  assert.equal(contents.backCalls, 1);
  assert.equal(contents.reloads, 1);
  assert.equal(contents.forwardCalls, 0, "forward ran on a page with no forward history");
});

test("a hidden tab keeps its page, and a closed tab does not", () => {
  const { instance, created, detached } = registry();
  instance.open({ ownerId: 1, tabId: "a", url: "https://a.example/", bounds: { x: 0, y: 0, width: 10, height: 10 } });
  instance.open({ ownerId: 1, tabId: "b", url: "https://b.example/", bounds: { x: 0, y: 0, width: 10, height: 10 } });

  // Switching tabs hides a page. It stays alive, because the human expects to
  // come back to where they were.
  instance.setVisible(1, "a", false);
  assert.equal(created[0].view.visible, false);
  assert.equal(instance.size, 2);
  assert.deepEqual(detached, []);

  instance.close(1, "a");
  assert.equal(instance.size, 1);
  assert.deepEqual(detached.map((d) => d.view), [created[0].view]);
});

test("every page a window owns closes with it, and no other window's", () => {
  const { instance, detached } = registry();
  instance.open({ ownerId: 1, tabId: "a", url: "https://a.example/", bounds: { x: 0, y: 0, width: 10, height: 10 } });
  instance.open({ ownerId: 1, tabId: "b", url: "https://b.example/", bounds: { x: 0, y: 0, width: 10, height: 10 } });
  instance.open({ ownerId: 2, tabId: "a", url: "https://c.example/", bounds: { x: 0, y: 0, width: 10, height: 10 } });

  instance.closeAllFor(1);

  assert.equal(instance.size, 1, "another window page was closed too");
  assert.equal(detached.length, 2);
  assert.equal(instance.contentsFor(2, "a") !== undefined, true);
  assert.equal(instance.contentsFor(1, "a"), undefined);
});

test("two windows may use the same tab id without meeting", () => {
  const { instance, created } = registry();
  instance.open({ ownerId: 1, tabId: "same", url: "https://one.example/", bounds: { x: 0, y: 0, width: 10, height: 10 } });
  instance.open({ ownerId: 2, tabId: "same", url: "https://two.example/", bounds: { x: 0, y: 0, width: 10, height: 10 } });

  assert.equal(instance.size, 2);
  assert.deepEqual(created[0].view.loaded, ["https://one.example/"]);
  assert.deepEqual(created[1].view.loaded, ["https://two.example/"]);
});

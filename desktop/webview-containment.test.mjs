import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { BROWSER_PARTITION, containWebviewGuest } = require("./desktop-runtime.cjs");

/**
 * What a hostile <webview> element would ask for if a page could influence its
 * attributes: every privilege on, our partition swapped for one it controls,
 * and a preload of its choosing.
 */
function hostileAttach() {
  return {
    webPreferences: {
      sandbox: false,
      contextIsolation: false,
      webSecurity: false,
      nodeIntegration: true,
      nodeIntegrationInSubFrames: true,
      nodeIntegrationInWorker: true,
      allowRunningInsecureContent: true,
      plugins: true,
      webviewTag: true,
      partition: "persist:attacker",
      preload: "/tmp/attacker-preload.js",
    },
    params: {
      preload: "file:///tmp/attacker-preload.js",
      webpreferences: "nodeIntegration=yes,contextIsolation=no",
      disablewebsecurity: "",
      partition: "persist:attacker",
      nodeintegration: "on",
      nodeintegrationinsubframes: "on",
      allowpopups: "true",
      src: "https://example.com",
    },
  };
}

test("a hostile guest cannot keep any privilege it asked for", () => {
  const { webPreferences, params } = hostileAttach();
  containWebviewGuest(webPreferences, params);

  assert.equal(webPreferences.sandbox, true);
  assert.equal(webPreferences.contextIsolation, true);
  assert.equal(webPreferences.webSecurity, true);
  assert.equal(webPreferences.nodeIntegration, false);
  assert.equal(webPreferences.nodeIntegrationInSubFrames, false);
  assert.equal(webPreferences.nodeIntegrationInWorker, false);
  assert.equal(webPreferences.allowRunningInsecureContent, false);
  assert.equal(webPreferences.plugins, false);
});

test("a guest may never create another guest", () => {
  const { webPreferences, params } = hostileAttach();
  containWebviewGuest(webPreferences, params);
  assert.equal(webPreferences.webviewTag, false);
});

test("the partition is ours, never the element's", () => {
  const { webPreferences, params } = hostileAttach();
  containWebviewGuest(webPreferences, params);

  assert.equal(webPreferences.partition, BROWSER_PARTITION);
  assert.equal("partition" in params, false);
});

test("no preload reaches a guest, from either side", () => {
  const { webPreferences, params } = hostileAttach();
  containWebviewGuest(webPreferences, params);

  assert.equal("preload" in webPreferences, false);
  assert.equal("preload" in params, false);
});

test("the element's own privilege attributes are discarded, not inspected", () => {
  const { webPreferences, params } = hostileAttach();
  containWebviewGuest(webPreferences, params);

  for (const attribute of [
    "webpreferences",
    "disablewebsecurity",
    "nodeintegration",
    "nodeintegrationinsubframes",
    "allowpopups",
  ]) {
    assert.equal(attribute in params, false, `${attribute} survived containment`);
  }
});

test("the requested page is left alone", () => {
  const { webPreferences, params } = hostileAttach();
  containWebviewGuest(webPreferences, params);
  assert.equal(params.src, "https://example.com");
});

test("an empty attach is contained rather than trusted", () => {
  const { webPreferences } = containWebviewGuest(undefined, undefined);

  assert.equal(webPreferences.sandbox, true);
  assert.equal(webPreferences.contextIsolation, true);
  assert.equal(webPreferences.nodeIntegration, false);
  assert.equal(webPreferences.webviewTag, false);
  assert.equal(webPreferences.partition, BROWSER_PARTITION);
});

test("the browser partition is persistent and is not the application's own", () => {
  assert.match(BROWSER_PARTITION, /^persist:/);
  assert.notEqual(BROWSER_PARTITION, "persist:omp-desktop");
});


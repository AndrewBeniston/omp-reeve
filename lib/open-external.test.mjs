import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { moduleCache: false, tryNative: false });
const { openExternal } = await jiti.import("./open-external.ts");

function replaceGlobal(name, value) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, value, writable: true });
  return () => {
    if (previous) Object.defineProperty(globalThis, name, previous);
    else delete globalThis[name];
  };
}

test("desktop external links use the Electron bridge", async (t) => {
  let bridgedUrl;
  let browserCalls = 0;
  const restoreDesktop = replaceGlobal("ompDesktop", {
    openExternal(url) {
      bridgedUrl = url;
      return Promise.resolve();
    },
  });
  const restoreWindow = replaceGlobal("window", {
    open() {
      browserCalls += 1;
    },
  });
  t.after(() => {
    restoreWindow();
    restoreDesktop();
  });

  openExternal("https://example.com/login");
  await Promise.resolve();

  assert.equal(bridgedUrl, "https://example.com/login");
  assert.equal(browserCalls, 0);
});

test("web external links use a protected browser tab", () => {
  let call;
  const restoreDesktop = replaceGlobal("ompDesktop", undefined);
  const restoreWindow = replaceGlobal("window", {
    open(...args) {
      call = args;
    },
  });
  try {
    openExternal("https://example.com/help");
  } finally {
    restoreWindow();
    restoreDesktop();
  }

  assert.deepEqual(call, ["https://example.com/help", "_blank", "noopener,noreferrer"]);
});

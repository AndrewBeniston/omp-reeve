import assert from "node:assert/strict";
import test from "node:test";
import React, { StrictMode, act } from "react";
import { createRoot } from "react-dom/client";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { readSoundEnabled, useAudio } = await jiti.import("./useAudio.ts");

function createDom() {
  function HTMLElement() {}
  function HTMLIFrameElement() {}

  const window = { HTMLElement, HTMLIFrameElement, getSelection() { return null; } };
  const document = {
    nodeType: 9,
    addEventListener() {},
    removeEventListener() {},
    defaultView: window,
    activeElement: null,
  };
  const container = {
    nodeType: 1,
    nodeName: "DIV",
    tagName: "DIV",
    namespaceURI: "http://www.w3.org/1999/xhtml",
    ownerDocument: document,
    addEventListener() {},
    removeEventListener() {},
    appendChild() {},
    removeChild() {},
    textContent: "",
  };

  window.document = document;
  document.documentElement = container;
  return { window, document, container };
}

function createStorage(storedValue) {
  const writes = [];
  return {
    writes,
    getItem(key) {
      assert.equal(key, "omp-sound-enabled");
      return storedValue;
    },
    setItem(key, value) {
      assert.equal(key, "omp-sound-enabled");
      writes.push(value);
      storedValue = value;
    },
  };
}

function createAudioContextClass() {
  const instances = [];

  class FakeAudioContext {
    constructor() {
      this.state = "suspended";
      this.currentTime = 10;
      this.destination = {};
      this.resumeCalls = 0;
      this.starts = [];
      instances.push(this);
    }

    resume() {
      this.resumeCalls += 1;
      this.state = "running";
      return Promise.resolve();
    }

    createOscillator() {
      return {
        type: "",
        frequency: { value: 0 },
        connect() {},
        start: (time) => this.starts.push(time),
        stop() {},
      };
    }

    createGain() {
      return {
        connect() {},
        gain: {
          setValueAtTime() {},
          linearRampToValueAtTime() {},
          exponentialRampToValueAtTime() {},
        },
      };
    }
  }

  return { FakeAudioContext, instances };
}

async function mountAudio(storedValue) {
  const previous = {
    AudioContext: globalThis.AudioContext,
    document: globalThis.document,
    localStorage: globalThis.localStorage,
    window: globalThis.window,
    actEnvironment: globalThis.IS_REACT_ACT_ENVIRONMENT,
  };
  const dom = createDom();
  const storage = createStorage(storedValue);
  const audio = createAudioContextClass();
  let current;

  globalThis.AudioContext = audio.FakeAudioContext;
  globalThis.document = dom.document;
  globalThis.localStorage = storage;
  globalThis.window = dom.window;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  function Probe() {
    current = useAudio();
    return null;
  }

  const root = createRoot(dom.container);
  const render = () => act(async () => {
    root.render(React.createElement(StrictMode, null, React.createElement(Probe)));
  });
  await render();

  return {
    audio,
    storage,
    render,
    get current() { return current; },
    async cleanup() {
      await act(async () => root.unmount());
      globalThis.AudioContext = previous.AudioContext;
      globalThis.document = previous.document;
      globalThis.localStorage = previous.localStorage;
      globalThis.window = previous.window;
      globalThis.IS_REACT_ACT_ENVIRONMENT = previous.actEnvironment;
    },
  };
}

test("reads the stored sound preference", () => {
  assert.equal(readSoundEnabled(null), true);
  assert.equal(readSoundEnabled("true"), true);
  assert.equal(readSoundEnabled("false"), false);
  assert.equal(readSoundEnabled("invalid"), false);
});

test("keeps the hook interface and callbacks stable across Strict Mode rerenders", async (t) => {
  const mounted = await mountAudio("false");
  t.after(() => mounted.cleanup());

  assert.deepEqual(Object.keys(mounted.current), [
    "soundEnabled",
    "onSoundToggle",
    "playDoneSound",
    "unlockAudio",
    "soundEnabledRef",
  ]);
  assert.equal(mounted.current.soundEnabled, false);
  assert.equal(mounted.current.soundEnabledRef.current, false);
  assert.equal(mounted.audio.instances.length, 0);

  const callbacks = mounted.current;
  await mounted.render();

  assert.equal(mounted.current.onSoundToggle, callbacks.onSoundToggle);
  assert.equal(mounted.current.playDoneSound, callbacks.playDoneSound);
  assert.equal(mounted.current.unlockAudio, callbacks.unlockAudio);
  assert.equal(mounted.current.soundEnabledRef, callbacks.soundEnabledRef);
});

test("creates and resumes audio only after an enabled user action", async (t) => {
  const mounted = await mountAudio("false");
  t.after(() => mounted.cleanup());

  await act(async () => mounted.current.unlockAudio());
  assert.equal(mounted.audio.instances.length, 0);

  const callbacks = mounted.current;
  await act(async () => mounted.current.onSoundToggle());

  assert.equal(mounted.current.soundEnabled, true);
  assert.equal(mounted.current.soundEnabledRef.current, true);
  assert.deepEqual(mounted.storage.writes, ["true"]);
  assert.equal(mounted.audio.instances.length, 1);
  assert.equal(mounted.audio.instances[0].resumeCalls, 1);
  assert.equal(mounted.current.onSoundToggle, callbacks.onSoundToggle);
  assert.equal(mounted.current.playDoneSound, callbacks.playDoneSound);
  assert.equal(mounted.current.unlockAudio, callbacks.unlockAudio);
});

test("reuses the unlocked context for completion playback", async (t) => {
  const mounted = await mountAudio("true");
  t.after(() => mounted.cleanup());

  assert.equal(mounted.audio.instances.length, 0);
  await act(async () => mounted.current.unlockAudio());
  mounted.current.playDoneSound();

  assert.equal(mounted.audio.instances.length, 1);
  assert.equal(mounted.audio.instances[0].resumeCalls, 1);
  assert.deepEqual(mounted.audio.instances[0].starts, [10, 10.18]);
});

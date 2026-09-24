import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { DictationControl, dictationPresentation } = await jiti.import("./DictationControl.tsx");

const labels = {
  idle: "Dictate",
  starting: "Starting dictation…",
  recording: "Stop dictation",
  finishing: "Finishing dictation",
  transcribing: "Transcribing",
  transcribingCancel: "Cancel transcription",
  failedRetry: "Retry dictation",
  failedView: "View recording",
  startError: "Unable to start dictation",
  transcribeError: "Unable to transcribe audio",
  unsupported: "Dictation is not available on this device",
  permissionDenied: "Microphone permission denied",
  openMicrophoneSettings: "Open microphone settings",
  dismiss: "Dismiss error",
};

test("maps bridge states to the shipped control actions", () => {
  assert.deepEqual(dictationPresentation("idle"), { action: "start", labelKey: "idle", disabled: false });
  assert.deepEqual(dictationPresentation("starting"), { action: "cancel", labelKey: "starting", disabled: false });
  assert.deepEqual(dictationPresentation("recording"), { action: "stop", labelKey: "recording", disabled: false });
  assert.deepEqual(dictationPresentation("finishing"), { action: "none", labelKey: "finishing", disabled: true });
  assert.deepEqual(dictationPresentation("transcribing"), { action: "cancel", labelKey: "transcribingCancel", disabled: false });
  assert.deepEqual(dictationPresentation("failed"), { action: "start", labelKey: "failedRetry", disabled: false });
});

test("renders every visible dictation state with its shipped string", () => {
  for (const state of ["idle", "starting", "recording", "finishing", "transcribing", "failed"]) {
    const html = renderToStaticMarkup(React.createElement(DictationControl, {
      state, labels, onAction() {}, onViewRecording() {},
    }));
    assert.match(html, new RegExp(labels[dictationPresentation(state).labelKey].replace("…", "…")));
  }
  const failed = renderToStaticMarkup(React.createElement(DictationControl, {
    state: "failed", labels, onAction() {}, onViewRecording() {},
  }));
  assert.match(failed, /Retry dictation/);
  assert.match(failed, /View recording/);
});

test("does not render dictation without bridge availability", () => {
  const html = renderToStaticMarkup(React.createElement(DictationControl, {
    state: "idle", available: false, labels, onAction() {}, onViewRecording() {},
  }));
  assert.equal(html, "");
});

test("offers the system microphone settings action after permission denial", () => {
  const previous = globalThis.ompDesktop;
  globalThis.ompDesktop = { openMicrophoneSettings() {} };
  try {
    const html = renderToStaticMarkup(React.createElement(DictationControl, {
      state: "failed",
      error: { kind: "permission", message: labels.permissionDenied },
      labels,
      onAction() {},
      onViewRecording() {},
      onOpenMicrophoneSettings() {},
    }));
    assert.match(html, /role="status"/);
    assert.match(html, /Open microphone settings/);
  } finally { globalThis.ompDesktop = previous; }
});

test("shows start and transcription failures as toasts", () => {
  for (const [kind, message] of [["start", labels.startError], ["transcription", labels.transcribeError]]) {
    const html = renderToStaticMarkup(React.createElement(DictationControl, {
      state: "failed", error: { kind, message }, labels, onAction() {}, onViewRecording() {},
    }));
    assert.match(html, /role="status"/);
    assert.match(html, new RegExp(message));
  }
});

test("lets the person dismiss a dictation error", async () => {
  const { click, mount } = await import("../../test/dom-harness.mjs");
  let dismissed = 0;
  const view = await mount(React.createElement(DictationControl, {
    state: "failed",
    error: { kind: "start", message: labels.startError },
    labels,
    onAction() {},
    onViewRecording() {},
    onDismissError() { dismissed += 1; },
  }));
  try {
    await click(view.container.querySelector("[data-dictation-dismiss]"));
    assert.equal(dismissed, 1);
  } finally {
    await view.unmount();
  }
});

import assert from "node:assert/strict";
import test from "node:test";

import { createLiveControllerBridge, shutdownLiveControllerBridges } from "./live-controller-bridge.ts";

function liveServices({ startError } = {}) {
  const controls = { stopCalls: 0, controller: null };
  return {
    controls,
    services: {
      createController(_session, callbacks) {
        let phase = "connecting";
        let muted = false;
        const controller = {
          get phase() { return phase; },
          get muted() { return muted; },
          async start() {
            if (startError) throw startError;
            phase = "listening";
            callbacks.onPhase("listening");
            callbacks.onLevels(0.2, 0.4);
            callbacks.onTranscript({ role: "user", text: "Check the logs.", turn: 1, final: true });
          },
          toggleMute() {
            muted = !muted;
            callbacks.onPhase(muted ? "muted" : "listening");
          },
          async stop() { controls.stopCalls += 1; },
        };
        controls.controller = controller;
        return controller;
      },
    },
  };
}

test("starts OMP live voice and reports its controller state", async () => {
  const { services, controls } = liveServices();
  const bridge = createLiveControllerBridge("session-1", {}, services);
  const reports = [];
  bridge.subscribe(report => reports.push(report));

  await bridge.start();

  assert.equal(bridge.snapshot.active, true);
  assert.equal(bridge.snapshot.phase, "listening");
  assert.equal(bridge.snapshot.microphoneLevel, 0.2);
  assert.equal(bridge.snapshot.outputLevel, 0.4);
  assert.equal(bridge.snapshot.transcript.text, "Check the logs.");
  assert.equal(bridge.snapshot.muted, false);
  assert.equal(bridge.snapshot.delegationActive, false);
  assert.equal(controls.controller.phase, "listening");
  assert.ok(reports.length >= 2);
  await bridge.close();
});

test("mute and delegation stay derived from OMP controller callbacks", async () => {
  let callbacks;
  const services = {
    createController(_session, nextCallbacks) {
      callbacks = nextCallbacks;
      let phase = "connecting";
      return {
        get phase() { return phase; },
        get muted() { return false; },
        async start() { phase = "listening"; callbacks.onPhase(phase); },
        toggleMute() {},
        async stop() {},
      };
    },
  };
  const bridge = createLiveControllerBridge("session-2", {}, services);
  await bridge.start();

  callbacks.onPhase("working");
  assert.equal(bridge.snapshot.delegationActive, true);
  callbacks.onPhase("muted");
  assert.equal(bridge.snapshot.muted, true);
  await bridge.close();
});

test("startup failure stops the controller and publishes the error", async () => {
  const { services, controls } = liveServices({ startError: new Error("Microphone unavailable") });
  const bridge = createLiveControllerBridge("session-3", {}, services);
  const reports = [];
  bridge.subscribe(report => reports.push(report));

  await bridge.start();

  assert.equal(bridge.snapshot.active, false);
  assert.equal(bridge.snapshot.error?.message, "Microphone unavailable");
  assert.equal(controls.stopCalls, 1);
  assert.equal(bridge.snapshot.error?.message, "Microphone unavailable");
  await bridge.close();
});

test("cancellation stops a starting controller and rejects no later reports", async () => {
  let finishStart;
  let callbacks;
  const services = {
    createController(_session, nextCallbacks) {
      callbacks = nextCallbacks;
      return {
        phase: "connecting",
        muted: false,
        async start() {
          await new Promise(resolve => { finishStart = resolve; });
          callbacks.onPhase("listening");
        },
        toggleMute() {},
        async stop() {},
      };
    },
  };
  const bridge = createLiveControllerBridge("session-4", {}, services);
  const start = bridge.start();
  await Promise.resolve();

  await bridge.cancel();
  finishStart();
  await start;

  assert.equal(bridge.snapshot.active, false);
  assert.equal(bridge.snapshot.phase, "cancelled");
  assert.equal(bridge.snapshot.delegationActive, false);
  await bridge.close();
});

test("session cleanup and server shutdown stop every live controller", async () => {
  const { services, controls } = liveServices();
  const bridge = createLiveControllerBridge("session-5", {}, services);
  await bridge.start();

  await bridge.close();
  await shutdownLiveControllerBridges();

  assert.equal(controls.stopCalls, 1);
  assert.equal(bridge.snapshot.active, false);
});

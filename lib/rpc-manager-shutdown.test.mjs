import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  moduleCache: false,
});
const { AgentSessionWrapper } = await jiti.import("./rpc-manager.ts");

// The wrapper builds an RpcSubagentRegistry, which subscribes to the session's
// event bus; these shutdown tests only care about teardown ordering, so hand it
// a bus that records nothing.
function makeEventBus() {
  return { on: () => () => {} };
}

test("session shutdown notifies extensions before disposing the SDK session", async () => {
  const calls = [];
  const inner = {
    isBashRunning: false,
    extensionRunner: {
      async emit(event) {
        calls.push(["emit", event]);
      },
    },
    dispose() {
      calls.push(["dispose"]);
    },
  };
  const wrapper = new AgentSessionWrapper(inner, makeEventBus());
  wrapper.onDestroy(() => calls.push(["destroy"]));

  await Promise.all([wrapper.shutdown(), wrapper.shutdown()]);

  assert.deepEqual(calls, [
    ["emit", { type: "session_shutdown", reason: "quit" }],
    ["dispose"],
    ["destroy"],
  ]);
  assert.equal(wrapper.isAlive(), false);
});

test("session shutdown still disposes the SDK session when an extension fails", async () => {
  const calls = [];
  const inner = {
    isBashRunning: false,
    extensionRunner: {
      async emit() {
        calls.push("emit");
        throw new Error("shutdown hook failed");
      },
    },
    dispose() {
      calls.push("dispose");
    },
  };
  const wrapper = new AgentSessionWrapper(inner, makeEventBus());
  wrapper.onDestroy(() => calls.push("destroy"));

  await assert.rejects(wrapper.shutdown(), /shutdown hook failed/);

  assert.deepEqual(calls, ["emit", "dispose", "destroy"]);
  assert.equal(wrapper.isAlive(), false);
});

test("direct destruction disposes the SDK session before unregistering the wrapper", () => {
  const calls = [];
  const inner = {
    isBashRunning: false,
    extensionRunner: {},
    dispose() {
      calls.push("dispose");
    },
  };
  const wrapper = new AgentSessionWrapper(inner, makeEventBus());
  wrapper.onDestroy(() => calls.push("destroy"));

  wrapper.destroy();
  wrapper.destroy();

  assert.deepEqual(calls, ["dispose", "destroy"]);
  assert.equal(wrapper.isAlive(), false);
});

test("shutdown prevents new work immediately and waits for this Session's disposal", async () => {
  let finishDisposal;
  const calls = [];
  const first = new AgentSessionWrapper({
    isBashRunning: false,
    beginDispose() { calls.push("first stopped"); },
    extensionRunner: { async emit() { calls.push("first extension"); } },
    dispose() {
      calls.push("first disposing");
      return new Promise((resolve) => { finishDisposal = resolve; });
    },
  }, makeEventBus());
  const second = new AgentSessionWrapper({
    isBashRunning: false,
    beginDispose() { calls.push("second stopped"); },
    dispose() { calls.push("second disposing"); },
  }, makeEventBus());

  let settled = false;
  const shutdown = first.shutdown().then(() => { settled = true; });
  assert.deepEqual(calls, ["first stopped"]);
  for (let index = 0; index < 10 && !finishDisposal; index += 1) await Promise.resolve();
  assert.equal(typeof finishDisposal, "function");
  await Promise.resolve();
  assert.equal(settled, false);
  assert.equal(second.isAlive(), true);
  assert.equal(calls.includes("second stopped"), false);
  finishDisposal();
  await shutdown;
  assert.equal(settled, true);
  second.destroy();
});

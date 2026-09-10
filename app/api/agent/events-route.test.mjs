import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

const agentEventsSource = await readFile(new URL("./[id]/events/route.ts", import.meta.url), "utf8");
const runningEventsSource = await readFile(new URL("./running/events/route.ts", import.meta.url), "utf8");
const jiti = createJiti(import.meta.url, {
  alias: { "@": process.cwd() },
  interopDefault: true,
  moduleCache: false,
});
const { GET: getAgentEvents } = await jiti.import("./[id]/events/route.ts");
const { AgentSessionWrapper } = await jiti.import("../../../lib/rpc-manager.ts");
const { cacheSessionPath } = await jiti.import("../../../lib/session-reader.ts");

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function requireBefore(promise, message) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        // This deadline tests event ordering after the mocked startup begins.
        timer = setTimeout(() => reject(new Error(message)), 1_000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function installDeferredStartup(t, id) {
  const previousLocks = globalThis.__ompStartLocks;
  const previousSessions = globalThis.__ompSessions;
  const startup = deferred();
  const observed = deferred();
  let startupSettled = false;
  let requestCount = 0;

  class ObservedStartLocks extends Map {
    get(key) {
      const value = super.get(key);
      if (key === id && value) {
        requestCount += 1;
        observed.resolve();
      }
      return value;
    }
  }

  globalThis.__ompSessions = new Map();
  globalThis.__ompStartLocks = new ObservedStartLocks([[id, startup.promise]]);
  cacheSessionPath(id, new URL(import.meta.url).pathname);

  t.after(() => {
    if (!startupSettled) startup.reject(new Error("Test startup cleanup"));
    globalThis.__ompStartLocks = previousLocks;
    globalThis.__ompSessions = previousSessions;
  });

  return {
    observed: observed.promise,
    resolve(value) {
      startupSettled = true;
      startup.resolve(value);
    },
    reject(error) {
      startupSettled = true;
      startup.reject(error);
    },
    getRequestCount() {
      return requestCount;
    },
  };
}

function makeWrapper(id) {
  let sdkListener;
  const inner = {
    sessionId: id,
    sessionFile: new URL(import.meta.url).pathname,
    isStreaming: false,
    isCompacting: false,
    isBashRunning: false,
    agent: { state: {} },
    sessionManager: {
      getCwd: () => process.cwd(),
      getEntries: () => [],
    },
    subscribe(listener) {
      sdkListener = listener;
      return () => { sdkListener = undefined; };
    },
    abortBash: () => {},
    dispose: () => {},
  };
  const wrapper = new AgentSessionWrapper(inner, { on: () => () => {} }, [id]);
  wrapper.start();
  return {
    wrapper,
    emit(event) {
      assert.ok(sdkListener, "The wrapper did not subscribe to SDK events");
      sdkListener(event);
    },
  };
}

async function openEventStream(t, id, startup, failureMessage) {
  const abortController = new AbortController();
  const responsePromise = getAgentEvents(
    new Request(`http://localhost/api/agent/${id}/events`, {
      headers: { host: "localhost" },
      signal: abortController.signal,
    }),
    { params: Promise.resolve({ id }) },
  );
  void responsePromise.catch(() => {});

  await requireBefore(startup.observed, "Mocked startup did not begin");
  const response = await requireBefore(responsePromise, failureMessage);
  assert.equal(response.status, 200);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";

  t.after(() => {
    abortController.abort();
    void reader.cancel().catch(() => {});
  });

  return {
    startup,
    async readEvent(message) {
      while (true) {
        const separator = buffered.indexOf("\n\n");
        if (separator !== -1) {
          const frame = buffered.slice(0, separator);
          buffered = buffered.slice(separator + 2);
          const data = frame.split("\n").find((line) => line.startsWith("data: "));
          if (data) return JSON.parse(data.slice(6));
        }
        const chunk = await requireBefore(reader.read(), message);
        assert.equal(chunk.done, false, message);
        buffered += decoder.decode(chunk.value, { stream: true });
      }
    },
  };
}

async function openDeferredEventStream(t, id, failureMessage) {
  const startup = installDeferredStartup(t, id);
  return openEventStream(t, id, startup, failureMessage);
}

test("agent SSE projects SDK events onto the fields consumed by the web client", () => {
  assert.match(agentEventsSource, /OMITTED_EVENT_TYPES = new Set\(\["turn_start", "turn_end", "tool_execution_update"\]\)/);
  assert.match(agentEventsSource, /delete clientEvent\.assistantMessageEvent/);
  assert.match(agentEventsSource, /event\.type === "agent_end"\) return \{ type: "agent_end" \}/);
  assert.match(agentEventsSource, /const clientEvent = toClientEvent\(event\)/);
});

test("SSE routes reuse one TextEncoder per stream", () => {
  for (const source of [agentEventsSource, runningEventsSource]) {
    assert.equal((source.match(/new TextEncoder\(\)/g) ?? []).length, 1);
    assert.match(source, /controller\.enqueue\(encoder\.encode\(text\)\)/);
    assert.match(source, /controller\.enqueue\(encoder\.encode\(":\\n\\n"\)\)/);
  }
});

test("agent SSE connects before deferred session startup resolves", async (t) => {
  const id = "events-connect-before-startup";
  const stream = await openDeferredEventStream(
    t,
    id,
    "SSE response did not arrive before startup resolved",
  );

  assert.deepEqual(await stream.readEvent("Connected event did not arrive"), {
    type: "connected",
    sessionId: id,
  });

  const session = makeWrapper(id);
  t.after(() => session.wrapper.destroy());
  stream.startup.resolve({ session: session.wrapper, realSessionId: id });
  await Promise.resolve();
  session.emit({ type: "message_start", marker: "after-startup" });

  assert.deepEqual(await stream.readEvent("Subscribed event did not arrive"), {
    type: "message_start",
    marker: "after-startup",
  });
});

test("agent SSE keeps events emitted during deferred session startup", async (t) => {
  const id = "events-during-startup";
  const stream = await openDeferredEventStream(
    t,
    id,
    "SSE connection was not available during startup",
  );
  await stream.readEvent("Connected event did not arrive");

  const session = makeWrapper(id);
  t.after(() => session.wrapper.destroy());
  session.emit({ type: "message_start", marker: "during-startup" });
  stream.startup.resolve({ session: session.wrapper, realSessionId: id });

  assert.deepEqual(await stream.readEvent("Startup event was lost"), {
    type: "message_start",
    marker: "during-startup",
  });
});

test("agent SSE reports a session startup failure after connecting", async (t) => {
  const id = "events-late-startup-failure";
  const stream = await openDeferredEventStream(
    t,
    id,
    "SSE connection was not available before startup failure",
  );
  await stream.readEvent("Connected event did not arrive");

  stream.startup.reject(new Error("extension startup exploded"));

  assert.deepEqual(await stream.readEvent("Late startup failure was not reported"), {
    type: "prompt_error",
    errorMessage: "Failed to start agent: extension startup exploded",
  });
});

test("concurrent agent SSE clients receive one shared startup event", async (t) => {
  const id = "events-concurrent-startup";
  const startup = installDeferredStartup(t, id);
  const [first, second] = await Promise.all([
    openEventStream(t, id, startup, "First SSE client did not connect during startup"),
    openEventStream(t, id, startup, "Second SSE client did not connect during startup"),
  ]);
  await Promise.all([
    first.readEvent("First connected event did not arrive"),
    second.readEvent("Second connected event did not arrive"),
  ]);

  const session = makeWrapper(id);
  t.after(() => session.wrapper.destroy());
  session.emit({ type: "message_start", marker: "shared-startup" });
  startup.resolve({ session: session.wrapper, realSessionId: id });

  assert.equal(startup.getRequestCount(), 2);
  assert.deepEqual(await first.readEvent("First client lost the startup event"), {
    type: "message_start",
    marker: "shared-startup",
  });
  assert.deepEqual(await second.readEvent("Second client lost the startup event"), {
    type: "message_start",
    marker: "shared-startup",
  });
});

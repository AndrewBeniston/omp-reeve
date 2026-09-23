import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { activeSpeechSessionId, closeSpeechSession, createSpeechBridge, getOrCreateSpeechBridge, getSpeechBridge, shutdownSpeechBridge } from "./speech-bridge.ts";

function speechServices({ cached = true, download = async () => {}, createController } = {}) {
  const controls = { controller: null, settings: { enabled: true, model: "whisper-base" } };
  const services = {
    async context() {
      return { enabled: controls.settings.enabled, modelKey: controls.settings.model, local: true };
    },
    async isCached() { return cached; },
    download,
    createController: createController ?? function ({ editor, onStateChange }) {
      const controller = {
        state: "idle",
        disposed: false,
        async toggle() {
          if (this.state === "idle") {
            this.state = "recording";
            onStateChange("recording");
          } else {
            this.state = "transcribing";
            onStateChange("transcribing");
            editor.commitVolatileText("A short note.");
            this.state = "idle";
            onStateChange("idle");
          }
        },
        dispose() { this.disposed = true; },
      };
      controls.controller = controller;
      return controller;
    },
    async stopWorker() {},
  };
  return { services, controls };
}

test("a dictation publishes OMP states and its final text", async () => {
  const { services } = speechServices();
  const bridge = createSpeechBridge("session-1", "/project", services);
  const events = [];
  bridge.subscribe(event => events.push(event));

  await bridge.start();
  await bridge.stop();

  assert.deepEqual(events.map(event => event.type === "state" ? event.state : event.type), [
    "idle", "starting", "recording", "finishing", "transcribing", "partial", "idle", "result",
  ]);
  assert.equal(events.at(-1).text, "A short note.");
  await bridge.close();
});

test("an offline first-use download reports progress and a typed failure", async () => {
  const { services } = speechServices({
    cached: false,
    async download(_key, onProgress) {
      onProgress({ percent: 23, label: "Fast" });
      throw new Error("Network offline");
    },
  });
  const bridge = createSpeechBridge("session-2", "/project", services);
  const events = [];
  bridge.subscribe(event => events.push(event));

  await bridge.start();

  assert.equal(bridge.snapshot, "failed");
  assert.deepEqual(events.find(event => event.type === "download"), {
    type: "download", percent: 23, label: "Fast",
  });
  assert.deepEqual(events.at(-1), { type: "error", code: "offline", message: "Network offline" });
  await bridge.close();
});

test("cancelling startup aborts the pending OMP model download", async () => {
  let started;
  const downloadStarted = new Promise(resolve => { started = resolve; });
  let signal;
  let workerStopped = false;
  const { services, controls } = speechServices({
    cached: false,
    download: async (_key, _onProgress, downloadSignal) => {
      signal = downloadSignal;
      started();
      await new Promise((_resolve, reject) => downloadSignal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
    },
  });
  services.stopWorker = async () => { workerStopped = true; };
  const bridge = createSpeechBridge("session-3", "/project", services);
  const events = [];
  bridge.subscribe(event => events.push(event));

  const start = bridge.start();
  await downloadStarted;
  await bridge.cancel();
  await start;

  assert.equal(signal.aborted, true);
  assert.equal(workerStopped, true);
  assert.equal(controls.controller, null);
  assert.equal(bridge.snapshot, "cancelled");
  assert.equal(events.some(event => event.type === "error"), false);
  await bridge.close();
});

test("a model worker being stopped keeps the speech slot busy", async () => {
  let enteredDownload;
  const downloadStarted = new Promise(resolve => { enteredDownload = resolve; });
  let finishWorkerStop;
  const workerStop = new Promise(resolve => { finishWorkerStop = resolve; });
  const { services } = speechServices({
    cached: false,
    download: async (_key, _progress, signal) => {
      enteredDownload();
      await new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
    },
  });
  services.stopWorker = () => workerStop;
  const bridge = getOrCreateSpeechBridge("session-worker-stop", "/project", services);

  const start = bridge.start();
  await downloadStarted;
  const cancel = bridge.cancel();
  assert.equal(activeSpeechSessionId(), "session-worker-stop");
  finishWorkerStop();
  await cancel;
  await start;
  await closeSpeechSession("session-worker-stop");
});

test("a denied microphone reports a permission error", async () => {
  const { services } = speechServices({
    createController({ onWarning }) {
      return {
        state: "idle",
        async toggle() { onWarning("Microphone permission denied"); },
        dispose() {},
      };
    },
  });
  const bridge = createSpeechBridge("session-4", "/project", services);
  const events = [];
  bridge.subscribe(event => events.push(event));

  await bridge.start();

  assert.equal(bridge.snapshot, "failed");
  assert.deepEqual(events.at(-1), {
    type: "error", code: "permission-denied", message: "Microphone permission denied",
  });
  await bridge.close();
});

test("a dictation can retry after microphone permission changes", async () => {
  let allowed = false;
  const { services } = speechServices({
    createController({ onWarning, onStateChange }) {
      return {
        state: "idle",
        async toggle() {
          if (!allowed) onWarning("Microphone permission denied");
          else { this.state = "recording"; onStateChange("recording"); }
        },
        dispose() {},
      };
    },
  });
  const bridge = createSpeechBridge("session-4b", "/project", services);

  await bridge.start();
  allowed = true;
  await bridge.start();

  assert.equal(bridge.snapshot, "recording");
  await bridge.close();
});

test("cancellation releases the microphone during recording", async () => {
  const { services, controls } = speechServices();
  let workerStopped = false;
  services.stopWorker = async () => { workerStopped = true; };
  const bridge = createSpeechBridge("session-5", "/project", services);
  const events = [];
  bridge.subscribe(event => events.push(event));

  await bridge.start();
  await bridge.cancel();

  assert.equal(controls.controller.disposed, true);
  assert.equal(workerStopped, true);
  assert.equal(bridge.snapshot, "cancelled");
  assert.equal(events.some(event => event.type === "result"), false);
  await bridge.close();
});

test("cancellation releases a microphone opened after startup completes", async () => {
  let finishStartup;
  const startup = new Promise(resolve => { finishStartup = resolve; });
  let enteredStartup;
  const startupEntered = new Promise(resolve => { enteredStartup = resolve; });
  let microphoneOpen = false;
  const { services } = speechServices({
    createController({ onStateChange }) {
      return {
        state: "idle",
        async toggle() {
          enteredStartup();
          await startup;
          microphoneOpen = true;
          this.state = "recording";
          onStateChange("recording");
        },
        dispose() { microphoneOpen = false; },
      };
    },
  });
  const bridge = createSpeechBridge("session-5b", "/project", services);
  const start = bridge.start();
  await startupEntered;
  await bridge.cancel();
  finishStartup();
  await start;

  assert.equal(microphoneOpen, false);
  assert.equal(bridge.snapshot, "cancelled");
  await bridge.close();
});

test("cancellation discards a transcription that finishes later", async () => {
  let resolveTranscription;
  const transcription = new Promise(resolve => { resolveTranscription = resolve; });
  let enteredTranscription;
  const transcriptionStarted = new Promise(resolve => { enteredTranscription = resolve; });
  const { services } = speechServices({
    createController({ editor, onStateChange }) {
      return {
        state: "idle",
        async toggle() {
          if (this.state === "idle") {
            this.state = "recording";
            onStateChange("recording");
            return;
          }
          this.state = "transcribing";
          onStateChange("transcribing");
          enteredTranscription();
          await transcription;
          editor.commitVolatileText("Late text");
          this.state = "idle";
          onStateChange("idle");
        },
        dispose() { this.state = "idle"; },
      };
    },
  });
  const bridge = createSpeechBridge("session-6", "/project", services);
  const events = [];
  bridge.subscribe(event => events.push(event));

  await bridge.start();
  const stop = bridge.stop();
  await transcriptionStarted;
  await bridge.cancel();
  resolveTranscription();
  await stop;

  assert.equal(bridge.snapshot, "cancelled");
  assert.equal(events.some(event => event.type === "result" || event.type === "partial"), false);
  await bridge.close();
});

test("a transcription failure remains visible after OMP returns to idle", async () => {
  const { services } = speechServices({
    createController({ onStateChange, onWarning }) {
      return {
        state: "idle",
        async toggle() {
          if (this.state === "idle") {
            this.state = "recording";
            onStateChange("recording");
            return;
          }
          this.state = "transcribing";
          onStateChange("transcribing");
          onWarning("Transcription failed");
          this.state = "idle";
          onStateChange("idle");
        },
        dispose() {},
      };
    },
  });
  const bridge = createSpeechBridge("session-6b", "/project", services);
  const events = [];
  bridge.subscribe(event => events.push(event));

  await bridge.start();
  await bridge.stop();

  assert.equal(bridge.snapshot, "failed");
  assert.deepEqual(events.find(event => event.type === "error"), {
    type: "error", code: "transcription", message: "Transcription failed",
  });
  await bridge.close();
});

test("a model change uses the new OMP role and downloads its weights once", async () => {
  const { services, controls } = speechServices();
  const cached = new Set(["whisper-base"]);
  const downloads = [];
  services.isCached = async key => cached.has(key);
  services.download = async key => { downloads.push(key); cached.add(key); };
  const bridge = createSpeechBridge("session-7", "/project", services);

  await bridge.start();
  await bridge.stop();
  controls.settings.model = "parakeet-tdt-0.6b-v3";
  await bridge.start();
  await bridge.stop();
  await bridge.start();
  await bridge.stop();

  assert.deepEqual(downloads, ["parakeet-tdt-0.6b-v3"]);
  await bridge.close();
});

test("session close releases its speech controller", async () => {
  const { services, controls } = speechServices();
  const bridge = getOrCreateSpeechBridge("session-8", "/project", services);
  await bridge.start();

  await closeSpeechSession("session-8");

  assert.equal(controls.controller.disposed, true);
  assert.equal(getSpeechBridge("session-8"), undefined);
});

test("closing a live Reeve session releases speech capture", async () => {
  const { AgentSessionWrapper } = await import("./rpc-manager.ts");
  const { services, controls } = speechServices();
  const bridge = getOrCreateSpeechBridge("session-9", "/project", services);
  await bridge.start();
  const wrapper = new AgentSessionWrapper({
    sessionId: "session-9", isBashRunning: false, extensionRunner: {}, dispose() {},
  }, { on: () => () => {} });

  wrapper.destroy();

  assert.equal(controls.controller.disposed, true);
  await closeSpeechSession("session-9");
});

test("deleting a saved session releases its speech capture", async () => {
  const { cacheSessionPath } = await import("./session-reader.ts");
  const { DELETE } = await import("../app/api/sessions/[id]/route.ts");
  const directory = mkdtempSync(join(tmpdir(), "reeve-speech-test-"));
  const sessionId = "speech-delete-test";
  const file = join(directory, "session.jsonl");
  writeFileSync(file, JSON.stringify({
    type: "session", version: 3, id: sessionId, cwd: directory, timestamp: "2026-09-23T00:00:00.000Z",
  }) + "\n");
  cacheSessionPath(sessionId, file);
  const { services, controls } = speechServices();
  const bridge = getOrCreateSpeechBridge(sessionId, directory, services);
  await bridge.start();

  try {
    const response = await DELETE(new Request(`http://localhost:30141/api/sessions/${sessionId}`, {
      method: "DELETE", headers: { host: "localhost:30141" },
    }), { params: Promise.resolve({ id: sessionId }) });

    assert.equal(response.status, 200);
    assert.equal(controls.controller.disposed, true);
    assert.equal(getSpeechBridge(sessionId), undefined);
  } finally {
    await closeSpeechSession(sessionId);
    rmSync(directory, { recursive: true, force: true });
  }
});

test("server shutdown releases every speech controller", async () => {
  const first = speechServices();
  const second = speechServices();
  const firstBridge = getOrCreateSpeechBridge("session-shutdown-a", "/project", first.services);
  const secondBridge = getOrCreateSpeechBridge("session-shutdown-b", "/project", second.services);
  await firstBridge.start();
  await secondBridge.start();

  await shutdownSpeechBridge();

  assert.equal(first.controls.controller.disposed, true);
  assert.equal(second.controls.controller.disposed, true);
  assert.equal(getSpeechBridge("session-shutdown-a"), undefined);
  assert.equal(getSpeechBridge("session-shutdown-b"), undefined);
});

test("the speech route rejects an untrusted request", async () => {
  const { GET } = await import("../app/api/sessions/[id]/speech/route.ts");
  const request = new Request("http://evil.example/api/sessions/unused/speech", {
    headers: { host: "evil.example" },
  });
  const response = await GET(request, { params: Promise.resolve({ id: "unused" }) });
  assert.equal(response.status, 403);
});

test("the speech route streams dictation events while POST returns promptly", async () => {
  const { cacheSessionPath, invalidateSessionPathCache } = await import("./session-reader.ts");
  const { GET, POST } = await import("../app/api/sessions/[id]/speech/route.ts");
  const directory = mkdtempSync(join(tmpdir(), "reeve-speech-route-"));
  const sessionId = "speech-route-test";
  const file = join(directory, "session.jsonl");
  writeFileSync(file, JSON.stringify({
    type: "session", version: 3, id: sessionId, cwd: directory, timestamp: "2026-09-23T00:00:00.000Z",
  }) + "\n");
  cacheSessionPath(sessionId, file);
  const { services } = speechServices();
  getOrCreateSpeechBridge(sessionId, directory, services);
  const abort = new AbortController();
  const route = { params: Promise.resolve({ id: sessionId }) };
  const base = `http://localhost:30141/api/sessions/${sessionId}/speech`;

  try {
    const response = await GET(new Request(`${base}?events`, {
      headers: { host: "localhost:30141" }, signal: abort.signal,
    }), route);
    assert.equal(response.status, 200);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const first = decoder.decode((await reader.read()).value);
    const second = decoder.decode((await reader.read()).value);
    assert.match(first + second, /"state":"idle"/);

    const startResponse = await POST(new Request(base, {
      method: "POST", headers: { host: "localhost:30141", "content-type": "application/json" },
      body: JSON.stringify({ action: "start" }),
    }), route);
    assert.equal(startResponse.status, 202);
    assert.equal((await startResponse.json()).sessionId, sessionId);
    const starting = decoder.decode((await reader.read()).value);
    const recording = decoder.decode((await reader.read()).value);
    assert.match(starting + recording, /"state":"starting"/);
    assert.match(starting + recording, /"state":"recording"/);

    await closeSpeechSession(sessionId);
    const cancelled = decoder.decode((await reader.read()).value);
    assert.match(cancelled, /"state":"cancelled"/);
    const closed = decoder.decode((await reader.read()).value);
    assert.match(closed, /"type":"closed"/);
    const end = await Promise.race([
      reader.read(),
      new Promise(resolve => setTimeout(() => resolve({ done: false }), 100)),
    ]);
    assert.equal(end.done, true);
  } finally {
    abort.abort();
    await closeSpeechSession(sessionId);
    invalidateSessionPathCache(sessionId);
    rmSync(directory, { recursive: true, force: true });
  }
});

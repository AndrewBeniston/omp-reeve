import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, writeFile, mkdir, readFile, truncate } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const {
  storeBrowserUpload, findBrowserUpload, releaseBrowserUpload, retainBrowserUploads,
  deleteSessionBrowserUploads, collectBrowserUploads, prepareBrowserUploadMessages, UPLOAD_ABANDONED_TTL_MS,
  UPLOAD_CLAIM_TTL_MS,
  MAX_UPLOAD_FILE_BYTES,
} = await createJiti(import.meta.url).import("./upload-store.ts");
const sessionA = "b7b00000-0000-4000-8000-000000000001";
const sessionB = "b7b00000-0000-4000-8000-000000000002";
const key = "cd000000-0000-4000-8000-000000000001";

function bytes(text) {
  return new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(text)); controller.close(); } });
}

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "reeve-upload-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test("a browser file receives one opaque Session-bound record", async (t) => {
  const root = await fixture(t);
  const first = await storeBrowserUpload({ root, sessionId: sessionA, key, name: "notes.txt", mediaType: "text/plain", size: 5, body: bytes("hello") });
  const found = await findBrowserUpload({ root, sessionId: sessionA, id: first.id });

  assert.deepEqual(first, { id: first.id, name: "notes.txt", size: 5, mediaType: "text/plain", state: "ready" });
  assert.match(first.id, /^up_[0-9a-f]{32}$/);
  assert.equal(found?.upload.id, first.id);
  assert.equal(await readFile(found.filePath, "utf8"), "hello");
  assert.equal(await findBrowserUpload({ root, sessionId: sessionB, id: first.id }), null);
  assert.equal(await findBrowserUpload({ root, sessionId: sessionA, id: "up_" + "f".repeat(32) }), null);
});

test("a retry with the same key returns the original upload without duplicating bytes", async (t) => {
  const root = await fixture(t);
  const input = { root, sessionId: sessionA, key, name: "clip.mov", mediaType: "video/quicktime", size: 5 };
  const first = await storeBrowserUpload({ ...input, body: bytes("first") });
  const repeated = await storeBrowserUpload({ ...input, body: bytes("other") });
  const files = await readdir(join(root, sessionA));

  assert.deepEqual(repeated, first);
  assert.equal(files.filter((name) => name.endsWith(".blob")).length, 1);
  await assert.rejects(
    storeBrowserUpload({ ...input, name: "different.mov", body: bytes("other") }),
    { status: 409 },
  );
});

test("a removed draft upload is deleted, while a saved Session upload survives draft release", async (t) => {
  const root = await fixture(t);
  const discarded = await storeBrowserUpload({ root, sessionId: sessionA, key, name: "draft.txt", mediaType: "text/plain", size: 5, body: bytes("draft") });
  assert.equal(await releaseBrowserUpload({ root, sessionId: sessionB, id: discarded.id }), false);
  assert.ok(await findBrowserUpload({ root, sessionId: sessionA, id: discarded.id }));
  assert.equal(await releaseBrowserUpload({ root, sessionId: sessionA, id: discarded.id }), true);
  assert.equal(await findBrowserUpload({ root, sessionId: sessionA, id: discarded.id }), null);

  const saved = await storeBrowserUpload({ root, sessionId: sessionA, key, name: "saved.txt", mediaType: "text/plain", size: 5, body: bytes("saved") });
  await retainBrowserUploads({ root, sessionId: sessionA, ids: [saved.id] });
  assert.equal(await releaseBrowserUpload({ root, sessionId: sessionA, id: saved.id }), false);
  await collectBrowserUploads({ root, now: Date.now() + UPLOAD_ABANDONED_TTL_MS + 1, hasPersistedMessage: async () => true });
  assert.ok(await findBrowserUpload({ root, sessionId: sessionA, id: saved.id }));
  await deleteSessionBrowserUploads({ root, sessionId: sessionA });
  assert.equal(await findBrowserUpload({ root, sessionId: sessionA, id: saved.id }), null);
});

test("a claim without a persisted OMP message expires under the named expiry policy", async (t) => {
  const root = await fixture(t);
  const upload = await storeBrowserUpload({
    root, sessionId: sessionA, key, name: "claim.txt", mediaType: "text/plain", size: 5, body: bytes("hello"),
  });
  await retainBrowserUploads({ root, sessionId: sessionA, ids: [upload.id] });

  await collectBrowserUploads({ root, now: Date.now() + 10_000, hasPersistedMessage: async () => false });
  assert.ok(await findBrowserUpload({ root, sessionId: sessionA, id: upload.id }));

  await collectBrowserUploads({ root, now: Date.now() + UPLOAD_CLAIM_TTL_MS + 1, hasPersistedMessage: async () => false });
  assert.equal(await findBrowserUpload({ root, sessionId: sessionA, id: upload.id }), null);
});

test("a test covers a crash between the claim and the persisted message", async (t) => {
  const agentDir = await fixture(t);
  const { getAgentDir, setAgentDir } = await import("@oh-my-pi/pi-utils/dirs");
  const previousAgentDir = getAgentDir();
  const previousEnv = process.env.PI_CODING_AGENT_DIR;
  const previousRuntime = process.env.NEXT_RUNTIME;
  setAgentDir(agentDir);
  process.env.NEXT_RUNTIME = "nodejs";
  t.after(() => {
    setAgentDir(previousAgentDir);
    if (previousEnv === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousEnv;
    if (previousRuntime === undefined) delete process.env.NEXT_RUNTIME;
    else process.env.NEXT_RUNTIME = previousRuntime;
  });

  const { SessionManager } = await import("@oh-my-pi/pi-coding-agent");
  const sessionFile = SessionManager.createEmptySessionFile(agentDir);
  const sessionId = (await readFile(sessionFile, "utf8")).split("\n")
    .map(line => { try { return JSON.parse(line); } catch { return null; } })
    .find(entry => entry?.type === "session")?.id;

  const crashedUpload = await storeBrowserUpload({
    sessionId, key: "cd000000-0000-4000-8000-000000000001",
    name: "crashed.txt", mediaType: "text/plain", size: 5, body: bytes("crash"),
  });
  await retainBrowserUploads({ sessionId, ids: [crashedUpload.id] });

  const persistedUpload = await storeBrowserUpload({
    sessionId, key: "cd000000-0000-4000-8000-000000000002",
    name: "persisted.txt", mediaType: "text/plain", size: 5, body: bytes("saved"),
  });
  await retainBrowserUploads({ sessionId, ids: [persistedUpload.id] });
  const manager = await SessionManager.open(sessionFile, agentDir);
  manager.appendMessage({
    role: "fileMention",
    files: [{ path: `browser-upload:${persistedUpload.id}/persisted.txt`, content: "saved" }],
  });
  await manager.ensureOnDisk();

  await collectBrowserUploads({ now: Date.now() + 1_000 });
  assert.ok(await findBrowserUpload({ sessionId, id: crashedUpload.id }));
  assert.ok(await findBrowserUpload({ sessionId, id: persistedUpload.id }));

  await collectBrowserUploads({ now: Date.now() + UPLOAD_CLAIM_TTL_MS + 1 });
  assert.equal(await findBrowserUpload({ sessionId, id: crashedUpload.id }), null);
  assert.ok(await findBrowserUpload({ sessionId, id: persistedUpload.id }));
});

test("an abandoned upload expires, but an active retry renews its expiry", async (t) => {
  const root = await fixture(t);
  const input = { root, sessionId: sessionA, key, name: "retry.txt", mediaType: "text/plain", size: 5 };
  const upload = await storeBrowserUpload({ ...input, body: bytes("hello") });
  const recordPath = join(root, sessionA, `${upload.id}.json`);
  const old = Date.now() - UPLOAD_ABANDONED_TTL_MS - 10_000;
  await writeFile(recordPath, JSON.stringify({
    ...JSON.parse(await readFile(recordPath, "utf8")), createdAt: old, lastAttemptAt: old,
  }));
  assert.deepEqual(await storeBrowserUpload({ ...input, body: bytes("other") }), upload);
  await collectBrowserUploads({ root, now: Date.now() + 1_000 });
  assert.ok(await findBrowserUpload({ root, sessionId: sessionA, id: upload.id }));
  await collectBrowserUploads({ root, now: Date.now() + UPLOAD_ABANDONED_TTL_MS + 1_000 });
  assert.equal(await findBrowserUpload({ root, sessionId: sessionA, id: upload.id }), null);
});

test("startup repairs crashes before and after metadata commit", async (t) => {
  const root = await fixture(t);
  const directory = join(root, sessionA);
  await mkdir(directory);
  const beforeId = `up_${"a".repeat(32)}`;
  const afterId = `up_${"b".repeat(32)}`;
  await writeFile(join(directory, `${beforeId}.part`), "unfinished");
  await writeFile(join(directory, `${beforeId}.blob`), "orphan");
  await writeFile(join(directory, `${beforeId}.json.tmp`), "incomplete");
  await writeFile(join(directory, `${afterId}.blob`), "committed");
  await writeFile(join(directory, `${afterId}.json`), JSON.stringify({
    id: afterId, sessionId: sessionA, key, name: "committed.txt", mediaType: "text/plain",
    size: 9, state: "ready", createdAt: Date.now(), lastAttemptAt: Date.now(),
  }));

  await collectBrowserUploads({ root });
  assert.deepEqual((await readdir(directory)).sort(), [`${afterId}.blob`, `${afterId}.json`]);
  assert.ok(await findBrowserUpload({ root, sessionId: sessionA, id: afterId }));
  await collectBrowserUploads({ root, now: Date.now() + UPLOAD_ABANDONED_TTL_MS + 1 });
  assert.equal(await findBrowserUpload({ root, sessionId: sessionA, id: afterId }), null);
});

test("server registration collects upload bytes whose Session no longer exists", async (t) => {
  const agentDir = await fixture(t);
  const { getAgentDir, setAgentDir } = await import("@oh-my-pi/pi-utils/dirs");
  const previousAgentDir = getAgentDir();
  const previousEnv = process.env.PI_CODING_AGENT_DIR;
  const previousRuntime = process.env.NEXT_RUNTIME;
  setAgentDir(agentDir);
  process.env.NEXT_RUNTIME = "nodejs";
  t.after(() => {
    setAgentDir(previousAgentDir);
    if (previousEnv === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousEnv;
    if (previousRuntime === undefined) delete process.env.NEXT_RUNTIME;
    else process.env.NEXT_RUNTIME = previousRuntime;
  });
  const upload = await storeBrowserUpload({ sessionId: sessionA, key, name: "orphan.txt", mediaType: "text/plain", size: 6, body: bytes("orphan") });
  await retainBrowserUploads({ sessionId: sessionA, ids: [upload.id] });
  const { register } = await createJiti(import.meta.url, { alias: { "@": process.cwd() } }).import("../instrumentation.ts");

  await register();
  assert.equal(await findBrowserUpload({ sessionId: sessionA, id: upload.id }), null);
});

test("server registration retains uploads referenced by an existing Session", async (t) => {
  const agentDir = await fixture(t);
  const { getAgentDir, setAgentDir } = await import("@oh-my-pi/pi-utils/dirs");
  const previousAgentDir = getAgentDir();
  const previousEnv = process.env.PI_CODING_AGENT_DIR;
  const previousRuntime = process.env.NEXT_RUNTIME;
  setAgentDir(agentDir);
  process.env.NEXT_RUNTIME = "nodejs";
  t.after(() => {
    setAgentDir(previousAgentDir);
    if (previousEnv === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousEnv;
    if (previousRuntime === undefined) delete process.env.NEXT_RUNTIME;
    else process.env.NEXT_RUNTIME = previousRuntime;
  });
  const { SessionManager } = await import("@oh-my-pi/pi-coding-agent");
  const sessionFile = SessionManager.createEmptySessionFile(agentDir);
  const sessionId = (await readFile(sessionFile, "utf8")).split("\n")
    .map(line => { try { return JSON.parse(line); } catch { return null; } })
    .find(entry => entry?.type === "session")?.id;
  const upload = await storeBrowserUpload({ sessionId, key, name: "saved.txt", mediaType: "text/plain", size: 5, body: bytes("saved") });
  await retainBrowserUploads({ sessionId, ids: [upload.id] });
  const { register } = await createJiti(import.meta.url, { alias: { "@": process.cwd() } }).import("../instrumentation.ts");

  await register();
  assert.ok(await findBrowserUpload({ sessionId, id: upload.id }));
});

test("a Session sends only its own uploaded bytes into OMP and retains the saved reference", async (t) => {
  const root = await fixture(t);
  const upload = await storeBrowserUpload({ root, sessionId: sessionA, key, name: "notes.txt", mediaType: "text/plain", size: 5, body: bytes("hello") });
  const messages = await prepareBrowserUploadMessages({ root, sessionId: sessionA, ids: [upload.id], cwd: root });
  assert.equal(messages.length, 1);
  assert.equal(messages[0].role, "fileMention");
  assert.match(messages[0].files[0].content, /notes\.txt[\s\S]*hello/);
  assert.deepEqual(messages[0].files.map(file => file.path), [`browser-upload:${upload.id}/notes.txt`]);
  assert.equal(JSON.stringify(messages).includes(root), false);
  await assert.rejects(
    prepareBrowserUploadMessages({ root, sessionId: sessionB, ids: [upload.id], cwd: root }),
    { status: 404 },
  );
  assert.equal(await releaseBrowserUpload({ root, sessionId: sessionA, id: upload.id }), false);
});

test("the OMP prompt receives browser upload context before the user's text", async (t) => {
  const agentDir = await fixture(t);
  const { getAgentDir, setAgentDir } = await import("@oh-my-pi/pi-utils/dirs");
  const previousAgentDir = getAgentDir();
  const previousEnv = process.env.PI_CODING_AGENT_DIR;
  setAgentDir(agentDir);
  t.after(() => {
    setAgentDir(previousAgentDir);
    if (previousEnv === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousEnv;
  });
  const upload = await storeBrowserUpload({ sessionId: sessionA, key, name: "notes.txt", mediaType: "text/plain", size: 5, body: bytes("hello") });
  const received = [];
  const inner = {
    sessionId: sessionA, isStreaming: false, isBashRunning: false,
    settings: { get: () => undefined },
    agent: { state: {}, appendMessage: message => received.push(["agent", message]) },
    sessionManager: {
      getCwd: () => agentDir, getEntries: () => [],
      appendMessage: message => received.push(["session", message]),
    },
    maybeStartTitleGeneration: () => {},
    prompt: async message => { received.push(["prompt", message]); },
    subscribe: () => () => {}, dispose: async () => {},
  };
  const { AgentSessionWrapper } = await createJiti(import.meta.url).import("./rpc-manager.ts");
  const wrapper = new AgentSessionWrapper(inner, { on: () => () => {} });
  t.after(() => wrapper.destroy());

  await wrapper.send({ type: "prompt", message: "Review this file", uploads: [upload.id] });
  assert.deepEqual(received.map(([destination]) => destination), ["agent", "session", "prompt"]);
  assert.match(received[0][1].files[0].content, /notes\.txt[\s\S]*hello/);
  assert.equal(received[2][1], "Review this file");
  assert.equal(await releaseBrowserUpload({ sessionId: sessionA, id: upload.id }), false);
});

test("deleting a Session removes its saved uploads and leaves another Session's bytes", async (t) => {
  const agentDir = await fixture(t);
  const { getAgentDir, setAgentDir } = await import("@oh-my-pi/pi-utils/dirs");
  const previousAgentDir = getAgentDir();
  const previousEnv = process.env.PI_CODING_AGENT_DIR;
  setAgentDir(agentDir);
  t.after(() => {
    setAgentDir(previousAgentDir);
    if (previousEnv === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousEnv;
  });
  const sessionFile = join(agentDir, "session.jsonl");
  await writeFile(sessionFile, JSON.stringify({ type: "session", id: sessionA, cwd: agentDir, timestamp: new Date().toISOString() }) + "\n");
  const own = await storeBrowserUpload({ sessionId: sessionA, key, name: "own.txt", mediaType: "text/plain", size: 3, body: bytes("own") });
  await retainBrowserUploads({ sessionId: sessionA, ids: [own.id] });
  const other = await storeBrowserUpload({ sessionId: sessionB, key, name: "else.txt", mediaType: "text/plain", size: 4, body: bytes("else") });
  const jiti = createJiti(import.meta.url, { alias: { "@": process.cwd() }, interopDefault: true, moduleCache: false });
  const { cacheSessionPath } = await jiti.import("./session-reader.ts");
  cacheSessionPath(sessionA, sessionFile);
  const { DELETE } = await jiti.import("../app/api/sessions/[id]/route.ts");

  const response = await DELETE(new Request(`http://localhost/api/sessions/${sessionA}`, {
    method: "DELETE", headers: { host: "localhost", origin: "http://localhost" },
  }), { params: Promise.resolve({ id: sessionA }) });
  assert.equal(response.status, 200);
  assert.equal(await findBrowserUpload({ sessionId: sessionA, id: own.id }), null);
  assert.ok(await findBrowserUpload({ sessionId: sessionB, id: other.id }));
});

test("a failed stream leaves no upload record or partial bytes", async (t) => {
  const root = await fixture(t);
  const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1])); controller.error(new Error("interrupted")); } });

  await assert.rejects(storeBrowserUpload({ root, sessionId: sessionA, key, name: "data.bin", mediaType: "application/octet-stream", size: 3, body }));
  assert.deepEqual(await readdir(join(root, sessionA)), []);
});

test("the next upload removes partial bytes left by an interrupted process", async (t) => {
  const root = await fixture(t);
  await mkdir(join(root, sessionA));
  await writeFile(join(root, sessionA, "up_" + "a".repeat(32) + ".part"), "abandoned");

  await storeBrowserUpload({ root, sessionId: sessionA, key, name: "new.txt", mediaType: "text/plain", size: 3, body: bytes("new") });
  assert.equal((await readdir(join(root, sessionA))).some((name) => name.endsWith(".part")), false);
});

test("invalid names, ids, and oversized streams are rejected", async (t) => {
  const root = await fixture(t);
  const input = { root, sessionId: sessionA, key, name: "data.bin", mediaType: "application/octet-stream", size: 3 };

  await assert.rejects(storeBrowserUpload({ ...input, name: "../private", body: bytes("abc") }), { status: 400 });
  await assert.rejects(storeBrowserUpload({ ...input, size: MAX_UPLOAD_FILE_BYTES + 1, body: bytes("abc") }), { status: 413 });
  await assert.rejects(storeBrowserUpload({ ...input, body: bytes("abcd") }), { status: 413 });
  await assert.rejects(findBrowserUpload({ root, sessionId: sessionA, id: "../private" }), { status: 400 });
  await assert.rejects(storeBrowserUpload({ ...input, sessionId: "../private", body: bytes("abc") }), { status: 400 });
});

test("Session and global quotas reject additional bytes", async (t) => {
  const root = await fixture(t);
  const { MAX_UPLOAD_SESSION_BYTES, MAX_UPLOAD_GLOBAL_BYTES } = await createJiti(import.meta.url).import("./upload-store.ts");
  const sessions = [1, 2, 3, 4].map(n => `b7b00000-0000-4000-8000-${String(n).padStart(12, "0")}`);
  for (const [index, sessionId] of sessions.entries()) {
    const idempotencyKey = `cd000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
    const upload = await storeBrowserUpload({ root, sessionId, key: idempotencyKey, name: "data.bin", mediaType: "application/octet-stream", size: 1, body: bytes("a") });
    const found = await findBrowserUpload({ root, sessionId, id: upload.id });
    await truncate(found.filePath, MAX_UPLOAD_SESSION_BYTES);
    const recordPath = found.filePath.replace(/\.blob$/, ".json");
    const record = JSON.parse(await readFile(recordPath, "utf8"));
    await writeFile(recordPath, JSON.stringify({ ...record, size: MAX_UPLOAD_SESSION_BYTES }));
    if (index === 0) {
      await assert.rejects(
        storeBrowserUpload({ root, sessionId, key: "cd000000-0000-4000-8000-000000000099", name: "extra.bin", mediaType: "application/octet-stream", size: 1, body: bytes("b") }),
        { status: 413 },
      );
    }
  }
  const remaining = MAX_UPLOAD_GLOBAL_BYTES - 4 * MAX_UPLOAD_SESSION_BYTES;
  const finalSession = "b7b00000-0000-4000-8000-000000000005";
  const last = await storeBrowserUpload({ root, sessionId: finalSession, key: "cd000000-0000-4000-8000-000000000005", name: "last.bin", mediaType: "application/octet-stream", size: 1, body: bytes("a") });
  const lastFound = await findBrowserUpload({ root, sessionId: finalSession, id: last.id });
  await truncate(lastFound.filePath, remaining);
  const lastRecordPath = lastFound.filePath.replace(/\.blob$/, ".json");
  const lastRecord = JSON.parse(await readFile(lastRecordPath, "utf8"));
  await writeFile(lastRecordPath, JSON.stringify({ ...lastRecord, size: remaining }));
  await assert.rejects(
    storeBrowserUpload({ root, sessionId: "b7b00000-0000-4000-8000-000000000006", key: "cd000000-0000-4000-8000-000000000006", name: "extra.bin", mediaType: "application/octet-stream", size: 1, body: bytes("b") }),
    { status: 413 },
  );
});

test("text, code, PDF, archive, audio, and video bytes reach the upload boundary", async (t) => {
  const root = await fixture(t);
  const types = [
    ["notes.txt", "text/plain"],
    ["main.ts", "text/typescript"],
    ["document.pdf", "application/pdf"],
    ["bundle.zip", "application/zip"],
    ["voice.wav", "audio/wav"],
    ["clip.mp4", "video/mp4"],
  ];
  for (const [index, [name, mediaType]] of types.entries()) {
    const upload = await storeBrowserUpload({
      root, sessionId: sessionA,
      key: `cd000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      name, mediaType, size: 3, body: bytes("abc"),
    });
    const found = await findBrowserUpload({ root, sessionId: sessionA, id: upload.id });
    assert.equal(upload.mediaType, mediaType);
    assert.equal(await readFile(found.filePath, "utf8"), "abc");
  }
});

test("the HTTP route accepts raw bytes and never returns a server path", async (t) => {
  const agentDir = await fixture(t);
  const { getAgentDir, setAgentDir } = await import("@oh-my-pi/pi-utils/dirs");
  const previousAgentDir = getAgentDir();
  const oldAgentDir = process.env.PI_CODING_AGENT_DIR;
  setAgentDir(agentDir);
  t.after(() => {
    setAgentDir(previousAgentDir);
    if (oldAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = oldAgentDir;
  });
  const sessionFile = join(agentDir, "session.jsonl");
  await writeFile(sessionFile, JSON.stringify({ type: "session", id: sessionA, cwd: agentDir, timestamp: new Date().toISOString() }) + "\n");
  const jiti = createJiti(import.meta.url, { alias: { "@": process.cwd() }, interopDefault: true, moduleCache: false });
  const { cacheSessionPath } = await jiti.import("./session-reader.ts");
  cacheSessionPath(sessionA, sessionFile);
  const { POST } = await jiti.import("../app/api/sessions/[id]/uploads/route.ts");
  const { GET, DELETE } = await jiti.import("../app/api/sessions/[id]/uploads/[uploadId]/route.ts");
  const url = `http://localhost/api/sessions/${sessionA}/uploads`;
  const request = new Request(url, {
    method: "POST",
    headers: {
      host: "localhost",
      origin: "http://localhost",
      "sec-fetch-site": "same-origin",
      "content-type": "application/octet-stream",
      "idempotency-key": key,
      "x-reeve-file-name": encodeURIComponent("notes 雪.txt"),
      "x-reeve-file-size": "5",
      "x-reeve-media-type": "text/plain",
    },
    body: "hello",
  });
  const response = await POST(request, { params: Promise.resolve({ id: sessionA }) });
  const upload = await response.json();
  const found = await GET(new Request(`${url}/${upload.id}`, { headers: { host: "localhost" } }), {
    params: Promise.resolve({ id: sessionA, uploadId: upload.id }),
  });

  assert.equal(response.status, 201);
  assert.deepEqual(upload, { id: upload.id, name: "notes 雪.txt", size: 5, mediaType: "text/plain", state: "ready" });
  assert.equal(found.status, 200);
  assert.deepEqual(await found.json(), upload);
  assert.equal(JSON.stringify(upload).includes(agentDir), false);
  const otherSession = await GET(new Request(`${url}/${upload.id}`, { headers: { host: "localhost" } }), {
    params: Promise.resolve({ id: sessionB, uploadId: upload.id }),
  });
  const forged = await GET(new Request(`${url}/up_${"f".repeat(32)}`, { headers: { host: "localhost" } }), {
    params: Promise.resolve({ id: sessionA, uploadId: `up_${"f".repeat(32)}` }),
  });
  const traversal = await GET(new Request(`${url}/..`, { headers: { host: "localhost" } }), {
    params: Promise.resolve({ id: sessionA, uploadId: "../private" }),
  });
  assert.equal(otherSession.status, 404);
  assert.equal(forged.status, 404);
  assert.equal(traversal.status, 400);
  const crossSite = await POST(new Request(url, {
    method: "POST", headers: { host: "localhost", origin: "https://attacker.example", "sec-fetch-site": "cross-site", "content-type": "application/octet-stream" }, body: "x",
  }), { params: Promise.resolve({ id: sessionA }) });
  const pathHeader = await POST(new Request(url, {
    method: "POST", headers: { host: "localhost", "content-type": "application/octet-stream", "x-reeve-file-path": "/private/file" }, body: "x",
  }), { params: Promise.resolve({ id: sessionA }) });
  assert.equal(crossSite.status, 403);
  assert.equal(pathHeader.status, 400);
  const otherDelete = await DELETE(new Request(`${url}/${upload.id}`, {
    method: "DELETE", headers: { host: "localhost", origin: "http://localhost" },
  }), { params: Promise.resolve({ id: sessionB, uploadId: upload.id }) });
  assert.equal(otherDelete.status, 404);
  assert.equal((await GET(new Request(`${url}/${upload.id}`, { headers: { host: "localhost" } }), {
    params: Promise.resolve({ id: sessionA, uploadId: upload.id }),
  })).status, 200);
  const ownDelete = await DELETE(new Request(`${url}/${upload.id}`, {
    method: "DELETE", headers: { host: "localhost", origin: "http://localhost" },
  }), { params: Promise.resolve({ id: sessionA, uploadId: upload.id }) });
  assert.equal(ownDelete.status, 204);
  assert.equal((await GET(new Request(`${url}/${upload.id}`, { headers: { host: "localhost" } }), {
    params: Promise.resolve({ id: sessionA, uploadId: upload.id }),
  })).status, 404);
});

test("the browser upload call sends the original file and keeps desktop paths separate", async (t) => {
  const jiti = createJiti(import.meta.url);
  const { uploadBrowserFile, addBrowserUpload, selectedAttachmentPaths, selectedBrowserUploadIds, addComposerAttachments } = await jiti.import("./composer-attachment-state.ts");
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const file = new File(["hello"], "notes 雪.txt", { type: "text/plain" });
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ id: "up_" + "a".repeat(32), name: file.name, size: 5, mediaType: file.type, state: "ready" }), { status: 201 });
  };

  const upload = await uploadBrowserFile(sessionA, file);
  const firstKey = request.options.headers["idempotency-key"];
  await uploadBrowserFile(sessionA, file);
  const desktop = addComposerAttachments([], [{ path: "/selected/file.txt", issuedAt: 1, signature: "sig", kind: "file" }]);
  const staged = addBrowserUpload(desktop, sessionA, upload, "File delivery is not available yet");

  assert.equal(request.url, `/api/sessions/${sessionA}/uploads`);
  assert.equal(request.options.body, file);
  assert.equal(request.options.headers["x-reeve-file-name"], encodeURIComponent(file.name));
  assert.equal(request.options.headers["content-type"], "application/octet-stream");
  assert.equal(request.options.headers["idempotency-key"], firstKey);
  assert.deepEqual(selectedAttachmentPaths(staged), [desktop[0].selection]);
  assert.equal(staged[1].upload.id, upload.id);
  assert.deepEqual(selectedBrowserUploadIds(staged, sessionA), [upload.id]);
  assert.throws(() => selectedBrowserUploadIds(staged, sessionB), /another Session/);
  assert.equal(addBrowserUpload([], sessionA, upload)[0].readError, null);
});

test("the existing password proxy protects uploads when locked and permits them when open", async (t) => {
  const root = await fixture(t);
  const oldPassword = process.env.OMP_WEB_PASSWORD;
  const oldAuthFile = process.env.OMP_WEB_AUTH_FILE;
  process.env.OMP_WEB_AUTH_FILE = join(root, "missing-auth.json");
  process.env.OMP_WEB_PASSWORD = "upload-test-password";
  t.after(() => {
    if (oldPassword === undefined) delete process.env.OMP_WEB_PASSWORD;
    else process.env.OMP_WEB_PASSWORD = oldPassword;
    if (oldAuthFile === undefined) delete process.env.OMP_WEB_AUTH_FILE;
    else process.env.OMP_WEB_AUTH_FILE = oldAuthFile;
  });
  const { NextRequest } = await import("next/server");
  const jiti = createJiti(import.meta.url, { alias: { "@": process.cwd() }, moduleCache: false, tryNative: false, tsconfigPaths: true });
  const { proxy } = await jiti.import("../proxy.ts");
  const url = `http://localhost/api/sessions/${sessionA}/uploads`;
  const request = (authorization) => new NextRequest(url, {
    method: "POST",
    headers: { host: "localhost", origin: "http://localhost", ...(authorization ? { authorization } : {}) },
  });

  assert.equal(proxy(request()).status, 401);
  assert.equal(proxy(request(`Basic ${btoa("omp:upload-test-password")}`)).status, 200);
  delete process.env.OMP_WEB_PASSWORD;
  assert.equal(proxy(request()).status, 200);
});

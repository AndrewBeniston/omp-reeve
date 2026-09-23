import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import { constants as fsConstants, readFileSync } from "node:fs";
import { access, chmod, mkdir, mkdtemp, open, opendir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { createJiti } from "jiti";

const { prepareAttachmentPathMessages, QueuedAttachmentContext } = await createJiti(import.meta.url).import("./attachment-paths.ts");
const { AgentSessionWrapper } = await createJiti(import.meta.url).import("./rpc-manager.ts");
const secret = "test-desktop-launch-secret";

function selected(pathname, issuedAt = Date.now()) {
  const signature = createHmac("sha256", secret)
    .update(JSON.stringify(["reeve-attachment-v1", pathname, issuedAt]))
    .digest("hex");
  return { path: pathname, issuedAt, signature };
}

test("a selected path with spaces, both quote types, and Unicode reaches OMP unchanged", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "reeve-attachment-"));
  const pathname = path.join(cwd, "a 'quoted' \"name\" 雪.txt");
  try {
    await writeFile(pathname, "The selected text.\n");

    const messages = await prepareAttachmentPathMessages([selected(pathname)], cwd, secret);

    assert.equal(messages.length, 1);
    assert.equal(messages[0].role, "fileMention");
    assert.deepEqual(messages[0].files.map(file => file.path), [pathname]);
    assert.match(messages[0].files[0].content, /The selected text\./);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("a prompt passes structured attachments to OMP without changing the typed text", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "reeve-attachment-"));
  const pathname = path.join(cwd, "a 'quoted' \"name\" 雪.txt");
  const received = [];
  const inner = {
    sessionId: "attachment-test",
    isStreaming: false,
    isBashRunning: false,
    settings: { get: () => undefined },
    agent: {
      state: {},
      appendMessage: message => received.push(["agent", message]),
    },
    sessionManager: {
      getCwd: () => cwd,
      getEntries: () => [],
      appendMessage: message => received.push(["session", message]),
    },
    maybeStartTitleGeneration: () => {},
    prompt: async (message) => {
      received.push(["prompt", message]);
      return true;
    },
    subscribe: () => () => {},
    dispose: async () => {},
  };
  const wrapper = new AgentSessionWrapper(inner, { on: () => () => {} });
  const previousSecret = process.env.OMP_WEB_DESKTOP_TOKEN;
  try {
    await writeFile(pathname, "The selected text.\n");
    process.env.OMP_WEB_DESKTOP_TOKEN = secret;

    await wrapper.send({ type: "prompt", message: "Explain this file.", attachments: [selected(pathname)] });
    await Promise.resolve();

    assert.equal(received.at(-1)?.[1], "Explain this file.");
    assert.deepEqual(received.slice(0, 2).map(([destination, message]) => [destination, message.role, message.files[0].path]), [
      ["agent", "fileMention", pathname],
      ["session", "fileMention", pathname],
    ]);
  } finally {
    if (previousSecret === undefined) delete process.env.OMP_WEB_DESKTOP_TOKEN;
    else process.env.OMP_WEB_DESKTOP_TOKEN = previousSecret;
    wrapper.destroy();
    await rm(cwd, { recursive: true, force: true });
  }
});

test("an active steer and follow-up deliver each selected path with the matching queued message", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "reeve-attachment-"));
  const pathname = path.join(cwd, "selected.txt");
  const folder = path.join(cwd, "selected folder");
  const queues = { steer: [], followUp: [] };
  const agent = {
    state: {},
    steer: message => queues.steer.push(message),
    followUp: message => queues.followUp.push(message),
    peekSteeringQueue: () => queues.steer,
    peekFollowUpQueue: () => queues.followUp,
    replaceQueues: (steering, followUp) => {
      queues.steer = [...steering];
      queues.followUp = [...followUp];
    },
    prepareQueuedMessages: async () => ({ commit: () => [] }),
  };
  const inner = {
    sessionId: "active-attachment-test",
    isStreaming: true,
    isBashRunning: false,
    settings: { get: () => undefined },
    agent,
    sessionManager: { getCwd: () => cwd, getEntries: () => [] },
    steer: async text => agent.steer({ role: "user", content: [{ type: "text", text }], timestamp: Date.now() }),
    followUp: async text => agent.followUp({ role: "user", content: [{ type: "text", text }], timestamp: Date.now() }),
    prompt: async (text, options) => {
      const queue = options?.streamingBehavior === "steer" ? agent.steer : agent.followUp;
      queue({ role: "user", content: [{ type: "text", text }], timestamp: Date.now() });
      return true;
    },
    subscribe: () => () => {},
    dispose: async () => {},
  };
  const wrapper = new AgentSessionWrapper(inner, { on: () => () => {} });
  const previousSecret = process.env.OMP_WEB_DESKTOP_TOKEN;
  try {
    await writeFile(pathname, "Selected text.\n");
    await mkdir(folder);
    await writeFile(path.join(folder, "inside.txt"), "Folder text.\n");
    process.env.OMP_WEB_DESKTOP_TOKEN = secret;

    const steering = await wrapper.send({ type: "steer", message: "Review these", attachments: [selected(pathname), selected(folder)] });
    await wrapper.send({ type: "follow_up", message: "Then summarize", attachments: [selected(pathname)] });

    assert.equal(queues.steer.length, 1);
    assert.equal(queues.followUp.length, 1);
    assert.equal(queues.steer[0].content[0].text, "Review these");
    assert.equal(queues.followUp[0].content[0].text, "Then summarize");
    const steeringContext = (await agent.prepareQueuedMessages([queues.steer[0]], new AbortController().signal)).commit();
    const followUpContext = (await agent.prepareQueuedMessages([queues.followUp[0]], new AbortController().signal)).commit();
    assert.deepEqual(steeringContext.flatMap(message => message.files?.map(file => file.path) ?? []), [pathname, folder]);
    assert.deepEqual(followUpContext.flatMap(message => message.files?.map(file => file.path) ?? []), [pathname]);

    const edit = await wrapper.send({ type: "begin_queue_edit", id: steering.items[0].id });
    await wrapper.send({ type: "complete_queue_edit", editToken: edit.editToken, message: "Review again" });
    assert.equal(queues.steer[0].content[0].text, "Review again");
    const editedContext = (await agent.prepareQueuedMessages([queues.steer[0]], new AbortController().signal)).commit();
    assert.deepEqual(editedContext.flatMap(message => message.files?.map(file => file.path) ?? []), [pathname, folder]);

    await wrapper.send({ type: "prompt", message: "One more review", streamingBehavior: "followUp", attachments: [selected(folder)] });
    assert.equal(queues.followUp[1].content[0].text, "One more review");
    const promptContext = (await agent.prepareQueuedMessages([queues.followUp[1]], new AbortController().signal)).commit();
    assert.deepEqual(promptContext.flatMap(message => message.files?.map(file => file.path) ?? []), [folder]);
  } finally {
    if (previousSecret === undefined) delete process.env.OMP_WEB_DESKTOP_TOKEN;
    else process.env.OMP_WEB_DESKTOP_TOKEN = previousSecret;
    wrapper.destroy();
    await rm(cwd, { recursive: true, force: true });
  }
});

test("parallel queued submissions keep each file with its own message", async () => {
  const queued = [];
  const agent = {
    steer: message => queued.push(message),
    followUp: message => queued.push(message),
    prepareQueuedMessages: async () => ({ commit: () => [] }),
  };
  const context = new QueuedAttachmentContext(agent);
  const file = path => [{ role: "fileMention", files: [{ path, content: "Selected" }], timestamp: Date.now() }];
  const send = async (text, pathname, delay) => context.run(file(pathname), async () => {
    await new Promise(resolve => setTimeout(resolve, delay));
    agent.steer({ role: "user", content: [{ type: "text", text }], timestamp: Date.now() });
  });

  await Promise.all([send("First", "/first.txt", 10), send("Second", "/second.txt", 0)]);
  const paths = await Promise.all(queued.map(async message => {
    const preparation = await agent.prepareQueuedMessages([message], new AbortController().signal);
    return [message.content[0].text, preparation.commit()[0].files[0].path];
  }));
  assert.deepEqual(paths, [["Second", "/second.txt"], ["First", "/first.txt"]]);
});

test("the desktop picker signs every selected file and folder without signing arbitrary paths", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "reeve-attachment-"));
  const pathname = path.join(cwd, "selected.txt");
  const folder = path.join(cwd, "selected folder");
  const arbitrary = path.join(cwd, "arbitrary.txt");
  let handler;
  const mainSource = readFileSync(new URL("../desktop/main.cjs", import.meta.url), "utf8");
  const pickerSource = mainSource.slice(
    mainSource.indexOf("function registerAttachmentPickerHandler()"),
    mainSource.indexOf("function registerApplicationMenu()"),
  );
  vm.runInNewContext(`${pickerSource}\nregisterAttachmentPickerHandler();`, {
    ipcMain: { handle: (_channel, callback) => { handler = callback; } },
    desktopUrl: "http://127.0.0.1:30142",
    isTrustedRendererUrl: () => true,
    BrowserWindow: { fromWebContents: () => ({}) },
    dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [pathname, folder] }) },
    process: { platform: "darwin" },
    attachmentSigningToken: secret,
    createHmac,
    fsConstants,
    access,
    open,
    opendir,
    stat,
    Date,
  });
  try {
    await writeFile(pathname, "selected\n");
    await mkdir(folder);
    await writeFile(arbitrary, "arbitrary\n");
    const picked = await handler({ senderFrame: { url: "http://127.0.0.1:30142/" }, sender: {} }, { secure: true, path: arbitrary });

    assert.equal(picked.length, 2);
    assert.deepEqual(Array.from(picked, ({ path, kind, readError }) => ({ path, kind, readError })), [
      { path: pathname, kind: "file", readError: null },
      { path: folder, kind: "folder", readError: null },
    ]);
    assert.deepEqual((await prepareAttachmentPathMessages(picked, cwd, secret))[0].files.map(file => file.path), [pathname, folder]);
    await assert.rejects(prepareAttachmentPathMessages([{ ...picked[0], path: arbitrary }], cwd, secret), /Invalid attachment selection/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("missing and unreadable selected paths fail before OMP receives a message", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "reeve-attachment-"));
  const missing = path.join(cwd, "missing.txt");
  const unreadable = path.join(cwd, "unreadable.txt");
  try {
    await writeFile(unreadable, "private\n");
    await chmod(unreadable, 0o000);

    await assert.rejects(prepareAttachmentPathMessages([selected(missing)], cwd, secret), /missing or inaccessible/);
    await assert.rejects(prepareAttachmentPathMessages([selected(unreadable)], cwd, secret), /missing or inaccessible/);
  } finally {
    await chmod(unreadable, 0o600);
    await rm(cwd, { recursive: true, force: true });
  }
});

test("OMP applies its text read limit, output truncation, and binary path behavior", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "reeve-attachment-"));
  const source = path.join(cwd, "source.ts");
  const large = path.join(cwd, "large.txt");
  const binary = path.join(cwd, "data.bin");
  try {
    await writeFile(source, `export const line = 1;\n${"content\n".repeat(15_000)}`);
    await writeFile(large, Buffer.alloc(5 * 1024 * 1024 + 1, 0x61));
    await writeFile(binary, Buffer.from([0, 1, 2, 3]));

    const [message] = await prepareAttachmentPathMessages(
      [selected(source), selected(large), selected(binary)], cwd, secret,
    );

    assert.equal(message.files[0].path, source);
    assert.match(message.files[0].content, /export const line = 1/);
    assert.match(message.files[0].content, /Showing lines 1-3000 of 15002/);
    assert.equal(message.files[1].skippedReason, "tooLarge");
    assert.equal(message.files[1].path, large);
    assert.equal(message.files[2].skippedReason, "binary");
    assert.equal(message.files[2].path, binary);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("OMP lists a directory in sorted order and stops after 500 entries", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "reeve-attachment-"));
  const directory = path.join(cwd, "folder");
  try {
    await mkdir(directory);
    await Promise.all(Array.from({ length: 501 }, (_, index) =>
      writeFile(path.join(directory, `item-${String(500 - index).padStart(3, "0")}.txt`), "")));

    const [message] = await prepareAttachmentPathMessages([selected(directory)], cwd, secret);

    const listing = message.files[0].content;
    assert.ok(listing.indexOf("item-000.txt") < listing.indexOf("item-001.txt"));
    assert.match(listing, /500 entries limit reached/);
    assert.doesNotMatch(listing, /item-500\.txt/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("OMP handles images through its 25 MB media limit", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "reeve-attachment-"));
  const small = path.join(cwd, "small.png");
  const large = path.join(cwd, "large.png");
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/5h8AAAAASUVORK5CYII=", "base64");
  try {
    await writeFile(small, png);
    await writeFile(large, Buffer.concat([png, Buffer.alloc(25 * 1024 * 1024 + 1)]));

    const [message] = await prepareAttachmentPathMessages([selected(small), selected(large)], cwd, secret);

    assert.match(message.files[0].image?.mimeType ?? "", /^image\//);
    assert.equal(message.files[1].skippedReason, "tooLarge");
    assert.equal(message.files[1].path, large);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("OMP generates video metadata and a preview contact sheet", async (t) => {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    execFileSync("ffprobe", ["-version"], { stdio: "ignore" });
  } catch {
    t.skip("ffmpeg and ffprobe are unavailable");
    return;
  }
  const cwd = await mkdtemp(path.join(tmpdir(), "reeve-attachment-"));
  const video = path.join(cwd, "preview.mp4");
  try {
    execFileSync("ffmpeg", ["-f", "lavfi", "-i", "color=c=blue:s=64x64:r=4:d=2", "-c:v", "mpeg4", "-y", video], { stdio: "ignore" });

    const [message] = await prepareAttachmentPathMessages([selected(video)], cwd, secret);

    assert.match(message.files[0].content, /Preview grid:/);
    assert.ok(message.files[0].image);
    assert.equal(message.files[0].path, video);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

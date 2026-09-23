import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { createJiti } from "jiti";

const { prepareAttachmentPathMessages } = await createJiti(import.meta.url).import("./attachment-paths.ts");
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

test("the desktop picker signs only paths returned by the operating system", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "reeve-attachment-"));
  const pathname = path.join(cwd, "selected.txt");
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
    dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [pathname] }) },
    process: { platform: "darwin" },
    attachmentSigningToken: secret,
    createHmac,
    Date,
  });
  try {
    await writeFile(pathname, "selected\n");
    await writeFile(arbitrary, "arbitrary\n");
    const picked = await handler({ senderFrame: { url: "http://127.0.0.1:30142/" }, sender: {} }, { secure: true, path: arbitrary });

    assert.equal(picked.length, 1);
    assert.equal(picked[0].path, pathname);
    assert.equal((await prepareAttachmentPathMessages(picked, cwd, secret))[0].files[0].path, pathname);
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

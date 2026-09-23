import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("./main.cjs", import.meta.url), "utf8");
const handlerSource = source.slice(source.indexOf("function registerAttachmentPickerHandler()"), source.indexOf("function registerSessionMenuHandler()"));

function picker({ platform = "darwin", canceled = false, window = {}, choice = 0 } = {}) {
  let handler;
  const dialogs = [];
  const choices = [];
  vm.runInNewContext(`${handlerSource}\nregisterAttachmentPickerHandler();`, {
    ipcMain: { handle: (name, callback) => { assert.equal(name, "omp-desktop:select-attachments"); handler = callback; } },
    desktopUrl: "http://127.0.0.1:30142",
    isTrustedRendererUrl: url => url === "http://127.0.0.1:30142/",
    BrowserWindow: { fromWebContents: () => window },
    process: { platform },
    dialog: {
      showMessageBox: async (_window, options) => { choices.push(options); return { response: choice }; },
      showOpenDialog: async (_window, options) => {
        dialogs.push(options);
        return { canceled, filePaths: ["/selected/file.txt", "/selected/folder"] };
      },
    },
  });
  return { handler, dialogs, choices };
}
const trusted = { senderFrame: { url: "http://127.0.0.1:30142/" }, sender: {} };

test("the attachment picker rejects untrusted frames before opening a dialog", async () => {
  const { handler, dialogs } = picker();
  await assert.rejects(handler({ senderFrame: { url: "https://example.com" } }), /did not come from the application/);
  await assert.rejects(handler({ senderFrame: null }), /did not come from the application/);
  assert.equal(dialogs.length, 0);
});
test("macOS selects multiple files and folders, while cancellation returns no paths", async () => {
  const { handler, dialogs } = picker();
  assert.deepEqual(await handler(trusted), ["/selected/file.txt", "/selected/folder"]);
  assert.deepEqual(Array.from(dialogs[0].properties), ["openFile", "openDirectory", "multiSelections"]);
  assert.equal((await picker({ canceled: true }).handler(trusted)).length, 0);
});
test("Windows and Linux offer separate multi-file and multi-folder native pickers", async () => {
  const { handler, dialogs, choices } = picker({ platform: "win32" });
  await handler(trusted);
  assert.equal(choices.length, 1);
  assert.deepEqual(Array.from(dialogs[0].properties), ["openFile", "multiSelections"]);
  const folders = picker({ platform: "linux", choice: 1 });
  await folders.handler(trusted);
  assert.deepEqual(Array.from(folders.dialogs[0].properties), ["openDirectory", "multiSelections"]);
  const cancelled = picker({ platform: "win32", choice: 2 });
  assert.equal((await cancelled.handler(trusted)).length, 0);
  assert.equal(cancelled.dialogs.length, 0);
});

test("the attachment picker requires an application window", async () => {
  await assert.rejects(picker({ window: null }).handler(trusted), /no application window/);
});

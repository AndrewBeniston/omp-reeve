import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("./main.cjs", import.meta.url), "utf8");
const handlerSource = source.slice(source.indexOf("function registerAttachmentPickerHandler()"), source.indexOf("function registerSessionMenuHandler()"));

function picker({ platform = "darwin", canceled = false, window = {} } = {}) {
  let handler;
  const dialogs = [];
  vm.runInNewContext(`${handlerSource}\nregisterAttachmentPickerHandler();`, {
    ipcMain: { handle: (name, callback) => { assert.equal(name, "omp-desktop:select-attachments"); handler = callback; } },
    desktopUrl: "http://127.0.0.1:30142",
    isTrustedRendererUrl: url => url === "http://127.0.0.1:30142/",
    BrowserWindow: { fromWebContents: () => window },
    process: { platform },
    dialog: { showOpenDialog: async (_window, options) => {
      dialogs.push(options);
      return { canceled, filePaths: ["/selected/file.txt", "/selected/folder"] };
    } },
  });
  return { handler, dialogs };
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
test("other platforms use the supported file picker and require an application window", async () => {
  const { handler, dialogs } = picker({ platform: "win32" });
  await handler(trusted);
  assert.deepEqual(Array.from(dialogs[0].properties), ["openFile", "multiSelections"]);
  await assert.rejects(picker({ window: null }).handler(trusted), /no application window/);
});

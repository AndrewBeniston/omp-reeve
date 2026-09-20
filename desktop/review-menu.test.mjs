import assert from "node:assert/strict";
import test from "node:test";
import { createReviewMenuTemplate, registerReviewMenu } from "./review-menu.cjs";

test("Review menu retains the reference order and does not offer copying an empty selection", () => {
  const actions = [];
  const menu = createReviewMenuTemplate({ hasSelection: false, onAction: (action) => actions.push(action) });
  assert.deepEqual(menu.map((item) => item.label ?? item.type), [
    "Open with", "separator", "Copy selection", "Copy path", "Copy relative path", "Copy diff", "Toggle line wrap",
  ]);
  assert.equal(menu[2].enabled, false);
  menu[0].submenu[0].click();
  menu[5].click();
  menu[6].click();
  assert.deepEqual(actions, ["open-file", "copy-diff", "toggle-wrap"]);
  assert.equal(createReviewMenuTemplate({ hasSelection: true, onAction() {} })[2].enabled, true);
});

test("the menu offers the applications it was given, and says so while it has none yet", () => {
  const actions = [];
  const onAction = (action) => actions.push(action);
  const waiting = createReviewMenuTemplate({ hasSelection: false, loadingTargets: true, onAction });
  // A submenu holding only "New tab" would read as "nothing is installed".
  assert.deepEqual(waiting[0].submenu.map((item) => item.label ?? item.type), ["New tab", "separator", "Looking for applications…"]);
  assert.equal(waiting[0].submenu[2].enabled, false);

  const targets = [
    { id: "vscode", label: "Visual Studio Code", available: true },
    { id: "zed", label: "Zed", available: false },
  ];
  const menu = createReviewMenuTemplate({ hasSelection: false, targets, preferredTargetId: "vscode", onAction });
  assert.equal(menu[0].label, "Open in Visual Studio Code");
  assert.deepEqual(menu[1].submenu.map((item) => item.label ?? item.type), ["New tab", "separator", "Visual Studio Code", "Zed"]);
  // An application Reeve knows about but cannot find is shown and disabled.
  assert.equal(menu[1].submenu[3].enabled, false);
  menu[0].click();
  menu[1].submenu[2].click();
  assert.deepEqual(actions, ["open-in:vscode", "open-in:vscode"]);
});

test("Review menu rejects untrusted senders and returns only the selected action", async () => {
  let handler;
  let select;
  registerReviewMenu({
    ipcMain: { handle(_channel, callback) { handler = callback; } },
    BrowserWindow: { fromWebContents(sender) { return sender.window; } },
    isTrusted: (event) => event.trusted === true,
    Menu: { buildFromTemplate(items) { return { popup({ callback }) { select?.(items); callback(); } }; } },
  });
  assert.throws(() => handler({ trusted: false }, {}), /not from the application/);
  assert.throws(() => handler({ trusted: true, sender: {} }, {}), /no application window/);
  const event = { trusted: true, sender: { window: {} } };
  assert.equal(await handler(event, {}), null);
  select = (items) => items.find((item) => item.label === "Toggle line wrap").click();
  assert.equal(await handler(event, {}), "toggle-wrap");
});

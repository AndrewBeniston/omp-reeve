import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { SETTINGS_SCHEMA } from "@oh-my-pi/pi-coding-agent/config/settings-schema";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { PATCH } = await jiti.import("./route.ts");
const { COMPLETION_SOUND_SETTING_PATH, WEB_SETTINGS_FIELDS } = await jiti.import("../../../lib/settings-api.ts");
const { COMPOSER_ENTER_BEHAVIOR_SETTING_PATH } = await jiti.import("../../../lib/composer-keyboard-commands.ts");
const {
  COMPOSER_ATTACHMENT_LAYOUT_SETTING_PATH,
  COMPOSER_PLAIN_TEXT_MODE_SETTING_PATH,
  COMPOSER_TOP_INSET_SETTING_PATH,
  DEFAULT_COMPOSER_ATTACHMENT_LAYOUT,
  readComposerAttachmentLayout,
  readComposerPlainTextMode,
} = await jiti.import("../../../lib/composer-display-preferences.ts");

test("the settings API exposes completion sound in Interaction Notifications without an OMP schema collision", async () => {
  const field = WEB_SETTINGS_FIELDS.find((item) => item.path === COMPLETION_SOUND_SETTING_PATH);
  const routeSource = await readFile(new URL("./route.ts", import.meta.url), "utf8");

  assert.ok(field, "The settings API must expose the browser completion sound preference.");
  assert.equal(field.tab, "interaction");
  assert.equal(field.group, "Notifications");
  assert.equal(field.type, "boolean");
  assert.equal(field.owner, "browser");
  assert.equal(COMPLETION_SOUND_SETTING_PATH, "web.omp-sound-enabled");
  assert.equal(COMPLETION_SOUND_SETTING_PATH in SETTINGS_SCHEMA, false);
  assert.match(routeSource, /fields\.push\(\.\.\.WEB_SETTINGS_FIELDS/);
});

test("the settings API exposes the three send shortcut behaviors as a browser preference", () => {
  const field = WEB_SETTINGS_FIELDS.find((item) => item.path === COMPOSER_ENTER_BEHAVIOR_SETTING_PATH);
  assert.ok(field);
  assert.equal(field.owner, "browser");
  assert.equal(field.type, "select");
  assert.equal(field.defaultValue, "enter");
  assert.deepEqual(field.options?.map((option) => option.value), ["enter", "cmdIfMultiline", "cmdAlways"]);
});

test("the settings API exposes the reference Composer display preferences as browser preferences", () => {
  const plainText = WEB_SETTINGS_FIELDS.find((item) => item.path === COMPOSER_PLAIN_TEXT_MODE_SETTING_PATH);
  const attachmentLayout = WEB_SETTINGS_FIELDS.find((item) => item.path === COMPOSER_ATTACHMENT_LAYOUT_SETTING_PATH);
  const topInset = WEB_SETTINGS_FIELDS.find((item) => item.path === COMPOSER_TOP_INSET_SETTING_PATH);

  assert.equal(plainText?.owner, "browser");
  assert.equal(plainText?.type, "boolean");
  assert.equal(plainText?.defaultValue, false);
  assert.equal(attachmentLayout?.owner, "browser");
  assert.equal(attachmentLayout?.type, "select");
  assert.equal(attachmentLayout?.defaultValue, "card");
  assert.deepEqual(attachmentLayout?.options?.map((option) => option.value), ["card", "icon"]);
  assert.equal(topInset?.owner, "browser");
  assert.equal(topInset?.type, "select");
  assert.equal(topInset?.defaultValue, 0);
  assert.deepEqual(topInset?.options?.map((option) => option.value), ["0", "8", "16", "24", "32", "40", "48", "56", "64"]);
  assert.equal(COMPOSER_PLAIN_TEXT_MODE_SETTING_PATH in SETTINGS_SCHEMA, false);
  assert.equal(COMPOSER_ATTACHMENT_LAYOUT_SETTING_PATH in SETTINGS_SCHEMA, false);
  assert.equal(COMPOSER_TOP_INSET_SETTING_PATH in SETTINGS_SCHEMA, false);
});

test("Composer display preference readers reject invalid saved values", () => {
  assert.equal(DEFAULT_COMPOSER_ATTACHMENT_LAYOUT, "card");
  assert.equal(readComposerPlainTextMode("true"), true);
  assert.equal(readComposerPlainTextMode("anything"), false);
  assert.equal(readComposerAttachmentLayout("icon"), "icon");
  assert.equal(readComposerAttachmentLayout("compact"), "card");
});

test("PATCH rejects a browser-owned settings field", async (t) => {
  const browserField = WEB_SETTINGS_FIELDS.find((field) => field.owner === "browser");
  assert.ok(browserField, "The settings API must declare a browser-owned field.");
  const root = await mkdtemp(join(tmpdir(), "omp-web-settings-route-"));
  const configFile = join(root, "config.yml");
  const originalConfig = "defaultThinkingLevel: medium\n";
  await writeFile(configFile, originalConfig);

  let pendingValue;
  globalThis.__ompRuntimePromise = Promise.resolve({
    settings: {
      set(_path, value) { pendingValue = value; },
      get() { return pendingValue; },
      async flush() { await writeFile(configFile, `completionSound: ${pendingValue}\n`); },
    },
  });
  t.after(async () => {
    globalThis.__ompRuntimePromise = undefined;
    await rm(root, { recursive: true, force: true });
  });

  const response = await PATCH(new Request("http://localhost/api/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: browserField.path, value: false }),
  }));

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Unknown setting" });
  assert.equal(pendingValue, undefined);
  assert.equal(await readFile(configFile, "utf8"), originalConfig);
});

test("approval mode changes persist and update every active Reeve session", async () => {
  const routeSource = await readFile(new URL("./route.ts", import.meta.url), "utf8");
  const rpcSource = await readFile(new URL("../../../lib/rpc-manager.ts", import.meta.url), "utf8");

  assert.match(routeSource, /path === "tools\.approvalMode"/);
  assert.match(routeSource, /settings\.override\("tools\.approvalMode", value\)/);
  assert.match(routeSource, /applyApprovalModeToRpcSessions\(value\)/);
  assert.match(rpcSource, /export function applyApprovalModeToRpcSessions/);
  assert.match(rpcSource, /session\.inner\.settings\.override\("tools\.approvalMode", mode\)/);
});

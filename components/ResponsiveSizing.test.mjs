import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const sheets = await Promise.all([
  "../app/globals.css",
  "./chat/composer.module.css",
  "./chat/chat-window.module.css",
  "./chat/message-view.module.css",
  "./file-viewer/file-viewer.module.css",
  "./navigation/navigation.module.css",
  "./shell/shell.module.css",
].map(async (path) => ({ path, text: await readFile(new URL(path, import.meta.url), "utf8") })));
const mobileHook = await readFile(new URL("../hooks/useIsMobile.ts", import.meta.url), "utf8");
const composerCss = sheets.find((sheet) => sheet.path === "./chat/composer.module.css")?.text ?? "";
const settingsSheets = await Promise.all([
  "./SettingsConfig.module.css",
  "./SearchableSelect.module.css",
  "./ModelsConfig.module.css",
  "./ModelRolesPanel.module.css",
  "./models/add-provider-picker.module.css",
  "./models/auth-detail.module.css",
  "./models/header-list-editor.module.css",
  "./models/model-detail.module.css",
  "./models/model-fields.module.css",
  "./models/models-sidebar-tree.module.css",
  "./models/provider-detail.module.css",
  "./models/thinking-level-map-editor.module.css",
].map(async (path) => ({ path, text: await readFile(new URL(path, import.meta.url), "utf8") })));

test("narrow desktop windows do not inherit touch-only control sizes", () => {
  for (const sheet of sheets) {
    const touchBlocks = sheet.text.match(/@media[^\{]*pointer:\s*coarse[^\{]*\{[\s\S]*?\n\}/g) ?? [];
    assert.ok(touchBlocks.length > 0, `${sheet.path} must contain a coarse-pointer media rule`);
    assert.match(touchBlocks.join("\n"), /(?:ui-control-touch|font-size:\s*16px)/, sheet.path);
  }
  assert.match(mobileHook, /const MOBILE_QUERY = "\(max-width: 640px\) and \(pointer: coarse\)"/);
});

test("the model control can shrink inside a narrow desktop composer", () => {
  assert.match(composerCss, /\.modelSelector\s*\{[^}]*min-width:\s*0;[^}]*max-width:\s*100%;/);
  assert.match(composerCss, /\.menuTrigger\s*\{[^}]*min-width:\s*0;[^}]*max-width:\s*100%;/);
  assert.match(composerCss, /\.modelName\s*\{[^}]*min-width:\s*0;/);
});

test("narrow desktop Settings keeps the complete sidebar and desktop control sizes", () => {
  for (const sheet of settingsSheets) {
    assert.doesNotMatch(
      sheet.text,
      /@media\s*\(max-width:\s*640px\),\s*\(pointer:\s*coarse\)/,
      `${sheet.path} must not apply touch sizes from width alone`,
    );
  }

  const settings = settingsSheets.find((sheet) => sheet.path === "./SettingsConfig.module.css")?.text ?? "";
  const narrowDesktop = settings.match(/@media \(max-width: 760px\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.doesNotMatch(narrowDesktop, /grid-template-columns:\s*82px/);
  assert.doesNotMatch(narrowDesktop, /grid-template-areas:/);
  assert.doesNotMatch(settings, /grid-template-columns:\s*82px/);
  assert.match(settings, /\.settingsLayout\s*\{[\s\S]*?grid-template-columns:\s*var\(--ui-panel-width\)/);
  assert.match(settings, /@media \(max-width: 760px\) and \(pointer: coarse\)[\s\S]*?grid-template-areas:\s*"label" "description" "control" "error"/);
});

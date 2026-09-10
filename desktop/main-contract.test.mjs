import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

test("the Electron lifecycle owns one stable desktop instance", () => {
  const source = readFileSync(join(import.meta.dir, "main.cjs"), "utf8");
  const lock = source.indexOf("app.requestSingleInstanceLock()");
  const startup = source.indexOf("app.whenReady()");
  const legacyProfile = source.indexOf('app.setPath("userData", path.join(app.getPath("appData"), "omp-desktop"))');

  assert.ok(legacyProfile >= 0);
  assert.ok(legacyProfile < lock);
  assert.ok(lock >= 0);
  assert.ok(startup > lock);
  assert.match(source, /app\.on\("second-instance"/);
  assert.match(source, /DESKTOP_PORT/);
  assert.doesNotMatch(source, /findFreeLoopbackPort/);
  assert.match(source, /window loaded/);
  assert.match(source, /randomUUID/);
  assert.match(source, /isExpectedServerResponse/);
  assert.match(source, /api\/desktop-health/);
  assert.match(source, /trafficLightPosition\s*=\s*\{ x: 16, y: 16 \}/);
  assert.match(source, /backgroundColor:\s*"#00000000"/);
  assert.match(source, /windowOptions\.vibrancy\s*=\s*"menu"/);
  assert.match(source, /windowOptions\.acceptFirstMouse\s*=\s*true/);
  assert.match(source, /nativeImage\.createFromDataURL/);
  assert.match(source, /image\.setTemplateImage\(true\)/);
  assert.match(source, /ipcMain\.handle\("omp-desktop:show-session-menu"/);
  assert.match(source, /ipcMain\.handle\("omp-desktop:show-project-menu"/);
  assert.match(source, /ipcMain\.handle\("omp-desktop:select-directory"/);
  assert.match(source, /dialog\.showOpenDialog/);
  assert.match(source, /isTrustedRendererUrl\(event\.senderFrame\.url, desktopUrl\)/);
  assert.match(source, /Menu\.buildFromTemplate\(createSessionMenuTemplate/);
  assert.match(source, /Menu\.buildFromTemplate\(createProjectMenuTemplate/);
  assert.match(source, /\[DESKTOP_CHALLENGE_HEADER\]: challenge/);
  assert.doesNotMatch(source, /headers:\s*\{\s*\[DESKTOP_CHALLENGE_HEADER\]: launchToken/);
});

test("enabling a webview guest does not weaken the host window", () => {
  const source = readFileSync(join(import.meta.dir, "main.cjs"), "utf8");

  // Permission to create a guest for a Browser tab.
  assert.match(source, /webviewTag:\s*true/);

  // The three guarantees the host keeps regardless. Enabling the flag above is
  // not allowed to trade any of them away.
  assert.match(source, /contextIsolation:\s*true/);
  assert.match(source, /nodeIntegration:\s*false/);
  assert.match(source, /sandbox:\s*true/);

  // Containment runs on attach, before a guest exists.
  assert.match(source, /on\("will-attach-webview"/);
  assert.match(source, /containWebviewGuest\(webPreferences, params\)/);

  // A guest's popups leave for the system browser rather than opening a window.
  assert.match(source, /on\("did-attach-webview"/);
  assert.match(source, /guestWebContents\.setWindowOpenHandler/);
});

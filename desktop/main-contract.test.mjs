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

test("a Browser tab is a page the main process owns, and no guest may exist", () => {
  const source = readFileSync(join(import.meta.dir, "main.cjs"), "utf8");

  // A Browser tab used to be a <webview> guest. Chromium reports a guest as a
  // webview target and OMP browser tool keeps only page targets, so the agent
  // could see nothing but Reeve own interface. A WebContentsView is a page.
  assert.match(source, /new WebContentsView\(\{ webPreferences \}\)/);
  assert.match(source, /contentView\.addChildView\(view\)/);

  // Nothing needs to create a guest any more, so nothing may. Refusing
  // outright is stronger than containing one after it attaches.
  assert.match(source, /webviewTag:\s*false/);
  assert.doesNotMatch(source, /webviewTag:\s*true/);
  assert.match(source, /on\("will-attach-webview"/);
  assert.match(source, /event\.preventDefault\(\)/);

  // The three guarantees the host keeps regardless.
  assert.match(source, /contextIsolation:\s*true/);
  assert.match(source, /nodeIntegration:\s*false/);
  assert.match(source, /sandbox:\s*true/);

  // A page popups leave for the system browser rather than opening a window,
  // and removing its view does not end it, so it is closed explicitly.
  assert.match(source, /contents\.setWindowOpenHandler/);
  assert.match(source, /view\.webContents\.close\(\)/);
});

test("a page in a Browser tab is refused a camera as firmly as the application is", () => {
  const source = readFileSync(join(import.meta.dir, "main.cjs"), "utf8");

  // A Browser tab runs in its own partition. A session with no permission
  // handler grants whatever a page asks for, so denying only the default
  // session left an ordinary web page able to take the camera or microphone.
  assert.match(source, /session\.fromPartition\(BROWSER_PARTITION\)/);
  assert.match(source, /setPermissionCheckHandler\(\(\) => false\)/);
  assert.match(source, /setPermissionRequestHandler/);
});

test("whether a port is open is asked of the command line, not inferred from the grant", () => {
  const source = readFileSync(join(import.meta.dir, "main.cjs"), "utf8");

  // A port opened any other way, by a developer flag or a wrapper script, is
  // still a port. Reporting it as shut because Reeve did not open it would be
  // reassuring at exactly the wrong moment.
  assert.match(source, /app\.commandLine\.hasSwitch\("remote-debugging-port"\)/);

  // The grant is read and applied before app-ready, which is the only moment
  // Chromium still accepts the switch, and the reason a grant takes effect at
  // the next launch rather than this one.
  const grantRead = source.indexOf("readAgentBrowserGrant(userDataDir)");
  const ready = source.indexOf("app.whenReady()");
  assert.ok(grantRead >= 0 && ready >= 0);
  assert.ok(grantRead < ready, "the grant must be read before the application is ready");

  // A closed launch clears the port file Chromium leaves behind, or the agent
  // would be handed a port that refuses every connection.
  assert.match(source, /removeStalePortFile\(userDataDir\)/);
});

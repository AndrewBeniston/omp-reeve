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
  // The window must never show the browser's own failure screen. Issue 7.
  assert.match(source, /webContents\.on\("did-fail-load"/);
  assert.match(source, /shouldReportLoadFailure/);
  assert.match(source, /createLoadFailurePage/);
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
  // The application menu stays registered on every platform, because it
  // carries the keyboard shortcuts. Windows hides the bar only. ADR-0008.
  assert.match(source, /Menu\.setApplicationMenu\(menu\)/);
  assert.doesNotMatch(source, /window\.removeMenu\(\)/);
  assert.match(source, /window\.setMenuBarVisibility\(false\)/);
  assert.match(source, /ipcMain\.handle\("omp-desktop:show-application-menu"/);
  assert.match(source, /\[DESKTOP_CHALLENGE_HEADER\]: challenge/);
  assert.doesNotMatch(source, /headers:\s*\{\s*\[DESKTOP_CHALLENGE_HEADER\]: launchToken/);
});

test("the menu bar height is one number, held by the main process and the renderer", () => {
  // The system draws its caption buttons on the overlay. The renderer draws
  // the menu on its own bar. The two heights must agree, or the buttons sit
  // off the bar. ADR-0008.
  const source = readFileSync(join(import.meta.dir, "main.cjs"), "utf8");
  const shellStyles = readFileSync(
    join(import.meta.dir, "..", "components", "shell", "shell.module.css"),
    "utf8",
  );
  const height = source.match(/const DESKTOP_TITLE_BAR_HEIGHT = (\d+);/)?.[1];
  assert.equal(height, "36");
  assert.match(
    shellStyles,
    new RegExp(`\\.applicationMenuBar\\s*\\{[^}]*height:\\s*${height}px;`),
  );
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appShellSource = await readFile(new URL("./AppShell.tsx", import.meta.url), "utf8");
const resizerSource = await readFile(new URL("../hooks/useResizablePanel.ts", import.meta.url), "utf8");
const stateStyles = await readFile(new URL("./shell/state-styles.module.css", import.meta.url), "utf8");
const shellStyles = await readFile(new URL("./shell/shell.module.css", import.meta.url), "utf8");
const shellLayoutSource = await readFile(new URL("./shell/ShellLayout.tsx", import.meta.url), "utf8");
const navigationStyles = await readFile(new URL("./navigation/navigation.module.css", import.meta.url), "utf8");
const globalStyles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("shell controls expose public state attributes", () => {
  assert.match(appShellSource, /state:\s*autoNameStatus\.kind/);
  assert.match(appShellSource, /disabled:\s*summaryTitleActionDisabled/);
  assert.match(appShellSource, /aria-expanded=\{rightPanelOpen\}/);

});

test("header controls share the 23px centre line", () => {
  assert.match(shellStyles, /\.headerBar\s*\{[^}]*align-items:\s*center;[^}]*height:\s*calc\(46px/);
  assert.match(shellStyles, /\.headerBar\s*\{[^}]*border-bottom:\s*1px solid var\(--ui-border\);[^}]*background:\s*var\(--ui-main\);/);
  // The edge icon controls must not touch the header edges. The same inset as the sidebar header.
  assert.match(shellStyles, /\.headerBar\s*\{[^}]*padding-inline:\s*var\(--space-2-5\);/);
  assert.match(
    shellStyles,
    /\.headerControl,\s*\.headerAction,\s*\.filePanelToggle\s*\{[^}]*height:\s*var\(--ui-control-sm\);/,
  );
  assert.match(
    shellStyles,
    /\.headerLeading,\s*\.headerSessionActions,\s*\.headerFileAction\s*\{[^}]*align-items:\s*center;[^}]*height:\s*100%;/,
  );
  assert.match(navigationStyles, /\.branchInline\s*\{[^}]*align-items:\s*center;/);
  assert.match(appShellSource, /className=\{shellStyles\.headerLeading\}[\s\S]*?data-sidebar-open=\{sidebarOpen\}/);
  assert.match(appShellSource, /className=\{shellStyles\.headerNewChatButton\}/);
  assert.match(appShellSource, /className=\{shellStyles\.headerSessionIdentity\}/);
  assert.match(appShellSource, /className=\{shellStyles\.headerSessionTitle\}/);
  assert.match(
    shellStyles,
    /:global\(html\[data-omp-desktop="darwin"\]\) \.headerBar\s*\{[^}]*-webkit-app-region:\s*drag;/,
  );
  assert.match(
    shellStyles,
    /:global\(html\[data-omp-desktop="darwin"\]\) \.headerLeading\[data-sidebar-open="true"\] \.mainSidebarToggle\s*\{[^}]*display:\s*none;/,
  );
  assert.match(
    shellStyles,
    /:global\(html\[data-omp-desktop="darwin"\]\) \.headerLeading\[data-sidebar-open="false"\]\s*\{[^}]*margin-left:\s*72px;/,
  );
});

test("visible chat header controls use the current Codex geometry", () => {
  assert.match(shellStyles, /\.headerSessionTitle\s*\{[^}]*font-size:\s*16px;[^}]*line-height:\s*24px;/);
  assert.match(shellStyles, /\.headerControl\s*\{[^}]*width:\s*24px;[^}]*height:\s*24px;[^}]*border-radius:\s*var\(--radius-lg\);/);
  assert.match(shellStyles, /\.filePanelToggle\s*\{[^}]*width:\s*24px;[^}]*height:\s*24px;[^}]*border-radius:\s*var\(--radius-lg\);/);
  assert.match(shellStyles, /\.headerNewChatButton\s*\{[^}]*width:\s*24px;[^}]*height:\s*24px;[^}]*border-radius:\s*var\(--radius-lg\);/);
  assert.match(shellStyles, /\.summaryToggle\.summaryToggle\s*\{[^}]*width:\s*28px;[^}]*height:\s*28px;[^}]*border-radius:\s*12px;/);
});

test("shell state styles use selectors instead of event style mutations", () => {
  for (const [name, source] of [
    ["AppShell", appShellSource],
    ["useResizablePanel", resizerSource],
  ]) {
  assert.doesNotMatch(source, /(?:currentTarget|document\.body|panelRef\.current\?)\.style\b/, name);
  }

  assert.match(stateStyles, /:hover/);
  assert.match(shellStyles, /\[aria-pressed="true"\]/);
  assert.match(shellStyles, /:disabled/);
  assert.match(stateStyles, /\[aria-expanded="true"\]/);
});

test("resizable panels expose measured width through DynamicStyleVars", () => {
  assert.doesNotMatch(appShellSource, /<DynamicStyleVars/);
  assert.equal((shellLayoutSource.match(/"--ui-panel-width"/g) ?? []).length, 2);
  assert.equal((shellLayoutSource.match(/getPanelWidthCssValue\(/g) ?? []).length, 2);
  assert.match(shellLayoutSource, /isMobile \? SIDEBAR_DEFAULT_WIDTH : sidebar\.resize\.width/);
  assert.match(stateStyles, /--sidebar-width:\s*var\(--ui-panel-width\)/);
  assert.match(stateStyles, /--right-panel-width:\s*var\(--ui-panel-width\)/);
  assert.match(resizerSource, /document\.body\.dataset\.panelResizing/);
});

test("panel CSS consumes runtime widths without numeric defaults", () => {
  assert.doesNotMatch(shellStyles, /\b(?:300|302)px\b/);
  assert.doesNotMatch(stateStyles, /\b302px\b/);
  assert.doesNotMatch(stateStyles, /var\(--ui-panel-width\s*,/);
  assert.match(shellStyles, /width: min\(var\(--ui-panel-width\), 85vw\)/);
  assert.match(shellStyles, /min-width: var\(--ui-panel-width\)/);
});

test("the sidebar footer keeps Settings on one horizontal row", () => {
  assert.match(appShellSource, /<SidebarFooter onOpenSettings=\{handleOpenSettings\}/);
  assert.match(appShellSource, /setSettingsSidebarWidth\(sidebarWidthRef\.current\);/);
  assert.match(appShellSource, /<SettingsConfig[\s\S]*?sidebarWidth=\{settingsSidebarWidth\}/);
  assert.doesNotMatch(appShellSource, /shellStateStyles\.sidebarSettings/);
});

test("the macOS sidebar layers the theme over native vibrancy", () => {
  assert.match(shellLayoutSource, /className=\{styles\.sidebarPanel\}/);
  assert.match(
    shellStyles,
    /:global\(html\[data-omp-desktop="darwin"\]\) \.sidebarPanel\s*\{[^}]*background:\s*color-mix\(in srgb, var\(--ui-sidebar\) 70%, transparent\);/,
  );
  assert.match(
    shellStyles,
    /:global\(html\[data-omp-desktop="darwin"\]\) \.shell\s*\{[^}]*background:\s*transparent;/,
  );
  assert.match(
    globalStyles,
    /html\[data-omp-desktop="darwin"\],\s*html\[data-omp-desktop="darwin"\] body\s*\{[^}]*background:\s*transparent;/,
  );
  assert.match(shellStyles, /\.centerColumn\s*\{[^}]*background:\s*var\(--ui-main\);/);
});

test("the narrow macOS sidebar stays inside the shell layout", () => {
  assert.match(
    shellStyles,
    /@media \(max-width: 959px\) \{[\s\S]*?:global\(html\[data-omp-desktop="darwin"\]\) \.sidebarPanel\s*\{[^}]*position:\s*relative;[^}]*inset:\s*auto;[^}]*transform:\s*none;[^}]*box-shadow:\s*none;/,
  );
  assert.match(
    shellStyles,
    /@media \(max-width: 959px\) \{[\s\S]*?:global\(html\[data-omp-desktop="darwin"\]\) \.sidebarBackdrop\s*\{[^}]*display:\s*none;/,
  );
  assert.match(
    shellStyles,
    /:global\(html\[data-omp-desktop="darwin"\]\) \.sidebarPanel\[data-open="false"\]\s*\{[^}]*width:\s*0;[^}]*min-width:\s*0;/,
  );
});

test("the Windows and Linux shell draws its own title bar", () => {
  // desktop/main.cjs hides the native caption and hands Electron the same 36px
  // height. The renderer bar and the overlay must agree, or the caption buttons
  // sit off the bar.
  assert.match(
    navigationStyles,
    /:global\(html\[data-omp-desktop="win32"\]\) \.desktopTitleBar,\s*:global\(html\[data-omp-desktop="linux"\]\) \.desktopTitleBar\s*\{[^}]*display:\s*flex;[^}]*height:\s*36px;[^}]*-webkit-app-region:\s*drag;/,
  );
});

test("the Windows and Linux header clears the native caption buttons", () => {
  // Windows keeps its caption buttons and draws them over the top right, so the
  // header reserves that width. macOS puts them on the left instead.
  // The reserve is measured, never fixed: a caption strip changes with the
  // window zoom and with the system's own metrics. ADR-0008.
  assert.match(
    shellStyles,
    /:global\(html\[data-omp-desktop="win32"\]\) \.headerBar,\s*:global\(html\[data-omp-desktop="linux"\]\) \.headerBar\s*\{[^}]*-webkit-app-region:\s*drag;[^}]*padding-right:\s*calc\(var\(--space-2-5\) \+ var\(--ui-caption-inset-end, 0px\)\);/,
  );
  assert.doesNotMatch(shellStyles, /138px/);
  assert.match(
    shellStyles,
    /:global\(html\[data-omp-desktop="win32"\]\) \.headerBar button,\s*:global\(html\[data-omp-desktop="linux"\]\) \.headerBar button\s*\{[^}]*-webkit-app-region:\s*no-drag;/,
  );
});

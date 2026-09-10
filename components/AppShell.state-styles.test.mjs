import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appShellSource = await readFile(new URL("./AppShell.tsx", import.meta.url), "utf8");
const resizerSource = await readFile(new URL("../hooks/useResizablePanel.ts", import.meta.url), "utf8");
const stateStyles = await readFile(new URL("./shell/state-styles.module.css", import.meta.url), "utf8");
const shellStyles = await readFile(new URL("./shell/shell.module.css", import.meta.url), "utf8");
const shellLayoutSource = await readFile(new URL("./shell/ShellLayout.tsx", import.meta.url), "utf8");
const navigationStyles = await readFile(new URL("./navigation/navigation.module.css", import.meta.url), "utf8");
const menuBarSource = await readFile(new URL("./shell/ApplicationMenuBar.tsx", import.meta.url), "utf8");
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
  // The resize handle lightens the border. It never paints the accent colour,
  // and it never keeps a mark after the pointer release. Issue 11.
  assert.match(
    shellStyles,
    /\.sidebarResizeHandle:hover::after,\s*\.sidebarResizeHandle\[data-resizing="true"\]::after,\s*\.rightPanelResizeHandle:hover::after,\s*\.rightPanelResizeHandle\[data-resizing="true"\]::after\s*\{[^}]*background:\s*var\(--ui-border-strong\);/,
  );
  assert.doesNotMatch(resizerSource, /target\.focus\(/);

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

test("the renderer draws one menu bar where it owns the menu", () => {
  // The bar sits above the application, carries the drag region, and reserves
  // the measured caption width on its trailing edge. ADR-0008.
  assert.match(
    shellStyles,
    /\.applicationMenuBar\s*\{[^}]*height:\s*36px;[^}]*padding-right:\s*calc\(var\(--space-2\) \+ var\(--ui-caption-inset-end, 0px\)\);[^}]*-webkit-app-region:\s*drag;/,
  );
  assert.match(
    shellStyles,
    /\.applicationMenuBar button\s*\{[^}]*-webkit-app-region:\s*no-drag;/,
  );
  assert.match(shellStyles, /\.shellFrame\s*\{[^}]*flex-direction:\s*column;/);
  assert.match(menuBarSource, /readMenuOwner\(\) === "application-menu"/);
  assert.doesNotMatch(menuBarSource, /process\.platform|navigator\.platform|win32/);
});

test("the sidebar bar and the second toggle stay off Windows and Linux", () => {
  // One toggle, at every sidebar state. The menu bar carries it, so the chat
  // header toggle is hidden wherever the renderer owns the menu. The darwin
  // rules below it are untouched.
  assert.match(
    navigationStyles,
    /:global\(html\[data-omp-menu="application-menu"\]\) \.desktopTitleBar\s*\{[^}]*display:\s*none;/,
  );
  assert.match(
    shellStyles,
    /:global\(html\[data-omp-menu="application-menu"\]\) \.mainSidebarToggle\s*\{[^}]*display:\s*none;/,
  );
  assert.match(
    shellStyles,
    /:global\(html\[data-omp-desktop="darwin"\]\) \.desktopTitleBar|:global\(html\[data-omp-desktop="darwin"\]\) \.headerLeading\[data-sidebar-open="true"\] \.mainSidebarToggle/,
  );
  assert.match(
    navigationStyles,
    /:global\(html\[data-omp-desktop="darwin"\]\) \.desktopTitleBar\s*\{[^}]*display:\s*flex;[^}]*height:\s*46px;/,
  );
});

test("the Windows and Linux header clears the native caption buttons", () => {
  // The main surface rounds its top left corner, where it meets the sidebar.
  // The reference applies the same radius on Windows at every window state.
  assert.match(
    shellStyles,
    /:global\(html\[data-omp-desktop="win32"\]\) \.centerColumn,\s*:global\(html\[data-omp-desktop="linux"\]\) \.centerColumn\s*\{[^}]*border-top-left-radius:\s*var\(--radius-lg\);/,
  );
  // The caption buttons sit on the menu bar above, so the header reserves
  // nothing. It still drags the window, and every button in it opts out.
  // No fixed reserve ships anywhere. ADR-0008.
  assert.match(
    shellStyles,
    /:global\(html\[data-omp-desktop="win32"\]\) \.headerBar,\s*:global\(html\[data-omp-desktop="linux"\]\) \.headerBar\s*\{[^}]*-webkit-app-region:\s*drag;/,
  );
  assert.doesNotMatch(shellStyles, /138px/);
  assert.match(
    shellStyles,
    /:global\(html\[data-omp-desktop="win32"\]\) \.headerBar button,\s*:global\(html\[data-omp-desktop="linux"\]\) \.headerBar button\s*\{[^}]*-webkit-app-region:\s*no-drag;/,
  );
});

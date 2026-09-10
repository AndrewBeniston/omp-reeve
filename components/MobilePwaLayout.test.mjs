import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const layoutSource = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
const cssSource = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const appShellSource = await readFile(new URL("./AppShell.tsx", import.meta.url), "utf8");
const chatWindowSource = await readFile(new URL("./ChatWindow.tsx", import.meta.url), "utf8");
const chatInputSource = await readFile(new URL("./ChatInput.tsx", import.meta.url), "utf8");
const composerFrameSource = await readFile(new URL("./chat/ComposerFrame.tsx", import.meta.url), "utf8");
const shellLayoutSource = await readFile(new URL("./shell/ShellLayout.tsx", import.meta.url), "utf8");
const shellCssSource = await readFile(new URL("./shell/shell.module.css", import.meta.url), "utf8");
const chatWindowCssSource = await readFile(new URL("./chat/chat-window.module.css", import.meta.url), "utf8");
const composerCssSource = await readFile(new URL("./chat/composer.module.css", import.meta.url), "utf8");
const composerEditorCssSource = await readFile(new URL("./chat/composer-editor.module.css", import.meta.url), "utf8");
const viewportHookSource = await readFile(new URL("../hooks/useViewportHeight.ts", import.meta.url), "utf8");

test("configures iOS standalone mode to use the full screen", () => {
  assert.match(layoutSource, /statusBarStyle: "default"/);
  assert.match(layoutSource, /viewportFit: "cover"/);
  assert.match(layoutSource, /interactiveWidget: "resizes-content"/);
});

test("tracks the visual viewport while the software keyboard is open", () => {
  assert.match(appShellSource, /useViewportHeight\(\)/);
  assert.match(appShellSource, /<ShellLayout[\s\S]*?header=\{/);
  assert.match(shellLayoutSource, /<section className=\{styles\.centerColumn\}>/);
  assert.match(shellLayoutSource, /isMobile \? SIDEBAR_DEFAULT_WIDTH : sidebar\.resize\.width/);
  assert.match(shellCssSource, /\.shell \{[\s\S]*?height: var\(--app-viewport-height, 100dvh\);[\s\S]*?padding-inline: env\(safe-area-inset-left\) env\(safe-area-inset-right\);[\s\S]*?overflow: hidden;/);
  assert.match(shellCssSource, /\.headerBar \{[\s\S]*?height: calc\(46px \+ env\(safe-area-inset-top\)\);[\s\S]*?padding-top: env\(safe-area-inset-top\);/);
  assert.match(shellCssSource, /\.sidebarPanel \{[\s\S]*?padding-block: env\(safe-area-inset-top\) env\(safe-area-inset-bottom\);/);
  assert.match(shellCssSource, /\.rightPanelHeader \{[\s\S]*?height: calc\(46px \+ env\(safe-area-inset-top\)\);[\s\S]*?padding-top: env\(safe-area-inset-top\);/);
  assert.match(shellCssSource, /@media \(max-width: 640px\) \{[\s\S]*?\.rightPanelContainer \{[\s\S]*?inset: 0 env\(safe-area-inset-right\) 0 env\(safe-area-inset-left\);[\s\S]*?height: var\(--app-viewport-height, 100dvh\);/);
  assert.match(viewportHookSource, /window\.visualViewport/);
  assert.match(viewportHookSource, /window\.requestAnimationFrame\(update\)/);
  assert.match(viewportHookSource, /window\.addEventListener\("resize", scheduleUpdate\)/);
  assert.match(viewportHookSource, /window\.addEventListener\("focusout", scheduleUpdate\)/);
  assert.match(viewportHookSource, /--app-viewport-height/);
  assert.match(viewportHookSource, /window\.scrollTo\(0, 0\)/);
  assert.match(cssSource, /height: var\(--app-viewport-height, 100dvh\)/);
  assert.match(chatWindowCssSource, /\.chatRoot \{[\s\S]*?padding-bottom: env\(safe-area-inset-bottom\);/);
  assert.match(composerCssSource, /\.composer \{[\s\S]*?padding-bottom: env\(safe-area-inset-bottom\);/);
});

test("contains Session content and inputs within the mobile viewport", () => {
  assert.match(cssSource, /\.markdown-body \{[\s\S]*?min-width: 0;[\s\S]*?max-width: 100%;[\s\S]*?overflow-x: hidden;/);
  assert.match(cssSource, /\.markdown-code-block \{[\s\S]*?min-width: 0;[\s\S]*?max-width: 100%;/);
  assert.match(appShellSource, /main=\{[\s\S]*?<ChatWindow/);
  assert.match(shellLayoutSource, /<main className=\{styles\.mainContent\}>\{main\}<\/main>/);
  assert.match(shellCssSource, /\.centerColumn \{[\s\S]*?min-width: 0;[\s\S]*?overflow: hidden;/);
  assert.match(shellCssSource, /\.contentLayout \{[\s\S]*?min-width: 0;[\s\S]*?min-height: 0;[\s\S]*?overflow: hidden;/);
  assert.match(shellCssSource, /\.mainContent \{[\s\S]*?min-width: 0;[\s\S]*?min-height: 0;[\s\S]*?overflow: hidden;/);
  assert.match(chatWindowSource, /className=\{`chat-session-scroll \$\{styles\.transcriptScroll\}`\}/);
  assert.match(chatWindowSource, /<div className=\{styles\.composerDock\}>[\s\S]*?\{chatInputElement\}/);
  assert.match(chatWindowCssSource, /\.chatRoot \{[\s\S]*?min-width: 0;[\s\S]*?height: 100%;[\s\S]*?overflow: hidden;/);
  assert.match(chatWindowCssSource, /\.transcriptScroll \{[\s\S]*?min-width: 0;[\s\S]*?flex: 1;[\s\S]*?overflow-x: hidden;[\s\S]*?overflow-y: auto;[\s\S]*?scrollbar-gutter: stable both-edges;/);
  assert.match(chatWindowCssSource, /\.transcriptGutter \{[\s\S]*?min-width: 0;[\s\S]*?padding: 0 var\(--space-4\);/);
  // The transcript maximum token equals the Composer maximum token.
  assert.match(chatWindowCssSource, /\.transcriptMeasure \{[\s\S]*?width: 100%;[\s\S]*?max-width: var\(--thread-content-max-width\);[\s\S]*?min-width: 0;/);
  assert.match(chatInputSource, /<ComposerFrame/);
  assert.match(composerFrameSource, /<form[\s\S]*?className=\{styles\.composerShell\}/);
  assert.match(composerCssSource, /\.composer \{[\s\S]*?width: 100%;[\s\S]*?max-width: var\(--composer-max-width\);[\s\S]*?box-sizing: border-box;/);
  assert.match(composerCssSource, /\.composerContent \{[\s\S]*?width: 100%;[\s\S]*?box-sizing: border-box;/);
  assert.match(composerCssSource, /\.composerFrame \{[\s\S]*?display: flex;[\s\S]*?width: 100%;/);
  assert.match(composerEditorCssSource, /\.host \{[\s\S]*?flex: 1;[\s\S]*?box-sizing: border-box;/);
  // Desktop renders the Context donut inside the right cluster. Mobile keeps it above the toolbar.
  assert.match(chatInputSource, /toolbarCenter=\{isMobile \? contextDonut : null\}/);
  assert.match(chatInputSource, /\{!isMobile && contextDonut\}/);
  assert.match(chatInputSource, /isMobile && !controlsMenuOpen/);
  assert.match(chatInputSource, /isMobile && controlsMenuOpen/);
  assert.match(composerFrameSource, /isMobile && toolbarCenter/);
  assert.match(composerFrameSource, /!isMobile && toolbarCenter/);
});

test("prevents iOS focus zoom from widening the layout", () => {
  assert.match(cssSource, /@media \(max-width: 640px\) and \(pointer: coarse\)[\s\S]*?textarea,[\s\S]*?input,[\s\S]*?select \{\s*font-size: 16px !important;/);
});

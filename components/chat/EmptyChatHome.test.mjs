import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";
import { React, mount, textOf } from "../../test/dom-harness.mjs";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { EmptyChatHome } = await jiti.import("./EmptyChatHome.tsx");
const { I18nProvider } = await jiti.import("../../hooks/useI18n.tsx");

const h = React.createElement;

function renderHome(props = {}) {
  return mount(h(I18nProvider, null, h(EmptyChatHome, {
    composer: h("div", { "data-test-composer": true }, "Composer"),
    contextLabel: "Chats",
    projectless: true,
    selectedPath: null,
    onProjectSelected() {},
    onProjectlessSelected() {},
    onSuggestionSelected() {},
    ...props,
  })));
}

test("shows the Codex-style projectless question with the real composer slot", async () => {
  const view = await renderHome();

  assert.match(textOf(view.container), /What should we build\?/);
  assert.match(textOf(view.container), /Choose Project/);
  assert.doesNotMatch(textOf(view.container), /Chats/);
  assert.ok(view.container.querySelector("[data-test-composer='true']"));

  await view.unmount();
});

test("shows the selected project in the home question", async () => {
  const view = await renderHome({ contextLabel: "omp-web", projectless: false, selectedPath: "/repos/omp-web" });

  assert.match(textOf(view.container), /What should we build in OMP Web\?/);

  await view.unmount();
});

test("delegates every project path to the shared project context bar", async () => {
  const source = await readFile(new URL("./EmptyChatHome.tsx", import.meta.url), "utf8");

  assert.match(source, /<ProjectContextBar/);
  assert.match(source, /selectedPath=\{selectedPath\}/);
  assert.doesNotMatch(source, /window\.piDesktop/);
  assert.doesNotMatch(source, /<DirectoryPicker/);
});

test("launches projectless chats without auto-selecting the newest project", async () => {
  const appShellSource = await readFile(new URL("../AppShell.tsx", import.meta.url), "utf8");
  const sidebarSource = await readFile(new URL("../SessionSidebar.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("./empty-chat-home.module.css", import.meta.url), "utf8");

  assert.match(appShellSource, /fetch\("\/api\/default-cwd", \{ method: "POST" \}\)/);
  assert.match(appShellSource, /beginNewSession\(data\.cwd, "chat"\)/);
  assert.match(appShellSource, /homeProjectless=/);
  assert.doesNotMatch(sidebarSource, /if \(projects\.length > 0\) setSelectedCwd\(projects\[0\]\)/);
  assert.match(sidebarSource, /disabled=\{!selectedCwd && !onNewProjectlessSession\}/);
  assert.match(css, /width: min\(820px, calc\(100% - var\(--space-6\)\)\)/);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}|\brgba?\(/i);
  assert.doesNotMatch(css, /\bInter\b/);
});

test("the project menu stays above the context row and composer", async () => {
  const homeCss = await readFile(new URL("./empty-chat-home.module.css", import.meta.url), "utf8");
  const projectCss = await readFile(new URL("./project-context-bar.module.css", import.meta.url), "utf8");
  const contextBarRule = homeCss.match(/\.contextBar \{(?<declarations>[^}]*)\}/)?.groups?.declarations ?? "";
  assert.doesNotMatch(contextBarRule, /z-index:/);
  assert.match(projectCss, /\.projectMenu \{[^}]*z-index: 40/);
  assert.match(homeCss, /\.composer \{[^}]*z-index: 2/);
  assert.match(projectCss, /\.projectMenu \{[\s\S]*?left: 0/);
  assert.doesNotMatch(projectCss, /\.projectMenu \{[^}]*translateX/);
});

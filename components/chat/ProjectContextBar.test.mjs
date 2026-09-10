import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";
import { React, click, mount, press, settle, textOf, typeInto } from "../../test/dom-harness.mjs";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { ProjectContextBar } = await jiti.import("./ProjectContextBar.tsx");
const { I18nProvider } = await jiti.import("../../hooks/useI18n.tsx");
const h = React.createElement;

const sessions = [{
  id: "omp",
  path: "/sessions/omp.jsonl",
  cwd: "/repos/omp-web",
  projectRoot: "/repos/omp-web",
  created: "2026-01-02T00:00:00Z",
  modified: "2026-01-02T00:00:00Z",
  messageCount: 1,
  firstMessage: "OMP",
}, {
  id: "help",
  path: "/sessions/help.jsonl",
  cwd: "/repos/help-self",
  projectRoot: "/repos/help-self",
  created: "2026-01-01T00:00:00Z",
  modified: "2026-01-01T00:00:00Z",
  messageCount: 1,
  firstMessage: "Help",
}];

function response(body, ok = true) {
  return { ok, status: ok ? 200 : 400, json: async () => body };
}

function installFetch() {
  const previous = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith("/api/sessions")) {
      return response({ sessions, projectOrder: ["/repos/omp-web", "/repos/help-self"] });
    }
    if (String(url).startsWith("/api/worktrees")) {
      return response({
        isGit: true,
        projectRoot: "/repos/omp-web",
        worktrees: [{ path: "/repos/omp-web", branch: "main", isMain: true }],
      });
    }
    if (String(url) === "/api/cwd/validate" && options?.method === "POST") {
      const cwd = JSON.parse(options.body).cwd;
      return response({ success: true, cwd });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };
  return () => { globalThis.fetch = previous; };
}

async function renderBar(props = {}) {
  return mount(h(I18nProvider, null, h(ProjectContextBar, {
    contextLabel: "OMP Web",
    projectless: false,
    selectedPath: "/repos/omp-web",
    onProjectSelected() {},
    onProjectlessSelected() {},
    ...props,
  })));
}

test("shows the project, local environment, branch, and complete Codex project menu", async (t) => {
  const restoreFetch = installFetch();
  t.after(restoreFetch);
  const view = await renderBar();
  await settle();

  assert.match(textOf(view.container), /OMP Web/);
  assert.match(textOf(view.container), /Local/);
  assert.match(textOf(view.container), /main/);

  await click(view.container.querySelector("[aria-haspopup='menu']"));
  await settle();
  const text = textOf(view.container);
  assert.equal(view.container.querySelector("input")?.getAttribute("placeholder"), "Search projects");
  assert.match(text, /Help Self/);
  assert.match(text, /New project/);
  assert.match(text, /Don't work in a project/);
  assert.doesNotMatch(text, /New remote project/);
  assert.ok(view.container.querySelector("[role='menuitemradio'][aria-checked='true']"));

  await view.unmount();
});

test("an unassigned new chat offers a project instead of naming Chats as a project", async (t) => {
  const restoreFetch = installFetch();
  t.after(restoreFetch);
  const view = await renderBar({
    contextLabel: "Chats",
    projectless: true,
    selectedPath: "/Users/example/omp-cwd-20260907",
  });

  const trigger = view.container.querySelector("[aria-haspopup='menu']");
  assert.equal(textOf(trigger), "Choose Project");
  assert.equal(trigger?.getAttribute("aria-label"), "Choose Project");
  assert.ok(trigger?.querySelector("[data-project-context-icon='folder']"));
  assert.doesNotMatch(textOf(view.container), /Chats/);

  await view.unmount();
});

test("selects an existing project through its complete path", async (t) => {
  const restoreFetch = installFetch();
  t.after(restoreFetch);
  let selected = null;
  const view = await renderBar({ onProjectSelected: (path) => { selected = path; } });
  await click(view.container.querySelector("[aria-haspopup='menu']"));
  await settle();
  const help = Array.from(view.container.querySelectorAll("[role='menuitemradio']"))
    .find((item) => textOf(item).includes("Help Self"));
  assert.ok(help);

  await click(help);
  await settle();

  assert.equal(selected, "/repos/help-self");
  await view.unmount();
});

test("filters projects, moves focus by keyboard, and reports an empty search", async (t) => {
  const restoreFetch = installFetch();
  t.after(restoreFetch);
  const view = await renderBar();
  await click(view.container.querySelector("[aria-haspopup='menu']"));
  await settle();
  const search = view.container.querySelector("input");
  await typeInto(search, "missing project");
  assert.match(textOf(view.container), /No matching projects/);
  await typeInto(search, "");
  await press(search, "ArrowDown");
  assert.equal(document.activeElement?.getAttribute("role"), "menuitemradio");
  await view.unmount();
});

test("starts a projectless chat from the complete menu", async (t) => {
  const restoreFetch = installFetch();
  t.after(restoreFetch);
  let selected = 0;
  const view = await renderBar({ onProjectlessSelected: () => { selected += 1; } });
  await click(view.container.querySelector("[aria-haspopup='menu']"));
  await settle();
  const item = Array.from(view.container.querySelectorAll("[role='menuitem']"))
    .find((candidate) => textOf(candidate) === "Don't work in a project");
  await click(item);
  assert.equal(selected, 1);
  await view.unmount();
});

test("keeps a failed project selection visible with its validation error", async (t) => {
  const previous = globalThis.fetch;
  t.after(() => { globalThis.fetch = previous; });
  globalThis.fetch = async (url) => {
    if (String(url).startsWith("/api/sessions")) return response({ sessions, projectOrder: [] });
    if (String(url).startsWith("/api/worktrees")) return response({ isGit: false, worktrees: [] });
    if (String(url) === "/api/cwd/validate") return response({ error: "Folder is unavailable" }, false);
    throw new Error(`Unexpected fetch: ${url}`);
  };
  const view = await renderBar();
  await click(view.container.querySelector("[aria-haspopup='menu']"));
  await settle();
  const help = Array.from(view.container.querySelectorAll("[role='menuitemradio']"))
    .find((item) => textOf(item).includes("Help Self"));
  await click(help);
  await settle();
  assert.equal(view.container.querySelector("[aria-haspopup='menu']")?.getAttribute("aria-expanded"), "true");
  assert.match(textOf(view.container.querySelector("[role='alert']")), /Folder is unavailable/);
  await view.unmount();
});

test("shows a retry state when project discovery fails", async (t) => {
  const previous = globalThis.fetch;
  t.after(() => { globalThis.fetch = previous; });
  globalThis.fetch = async (url) => {
    if (String(url).startsWith("/api/sessions")) return response({ error: "Offline" }, false);
    if (String(url).startsWith("/api/worktrees")) return response({ isGit: false, worktrees: [] });
    throw new Error(`Unexpected fetch: ${url}`);
  };
  const view = await renderBar();
  await click(view.container.querySelector("[aria-haspopup='menu']"));
  await settle();
  assert.match(textOf(view.container.querySelector("[role='alert']")), /Projects could not be loadedRetry/);
  await view.unmount();
});

test("uses the protected desktop directory picker for a new project", async (t) => {
  const restoreFetch = installFetch();
  const previousDesktop = window.ompDesktop;
  t.after(() => {
    restoreFetch();
    window.ompDesktop = previousDesktop;
  });
  window.ompDesktop = { selectDirectory: async () => "/repos/new-project" };
  let selected = null;
  const view = await renderBar({ onProjectSelected: (path) => { selected = path; } });
  await click(view.container.querySelector("[aria-haspopup='menu']"));
  await settle();
  const add = Array.from(view.container.querySelectorAll("[role='menuitem']"))
    .find((item) => textOf(item) === "New project");
  assert.ok(add);

  await click(add);
  await settle();

  assert.equal(selected, "/repos/new-project");
  await view.unmount();
});

test("keeps the browser directory picker as the non-desktop adapter", async (t) => {
  const restoreFetch = installFetch();
  const previousDesktop = window.ompDesktop;
  t.after(() => {
    restoreFetch();
    window.ompDesktop = previousDesktop;
  });
  window.ompDesktop = undefined;
  const view = await renderBar();
  await click(view.container.querySelector("[aria-haspopup='menu']"));
  await settle();
  const add = Array.from(view.container.querySelectorAll("[role='menuitem']"))
    .find((item) => textOf(item) === "New project");
  await click(add);
  await settle();

  assert.match(textOf(document.body), /Select directory/);
  await view.unmount();
});

test("uses measured Codex geometry and theme tokens", async () => {
  const css = await readFile(new URL("./project-context-bar.module.css", import.meta.url), "utf8");
  assert.match(css, /width:\s*336px/);
  assert.match(css, /border-radius:\s*20px/);
  assert.match(css, /font-family:\s*var\(--font-sans\)/);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}|\brgba?\(|\bInter\b/i);
});

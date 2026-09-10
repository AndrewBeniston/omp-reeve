import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";
import { click, domDocument, domWindow, mount, press, settle } from "../test/dom-harness.mjs";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});

const { AppHeader, HeaderAction } = await jiti.import("./shell/AppHeader.tsx");
const { AppShell } = await jiti.import("./AppShell.tsx");
const { I18nProvider } = await jiti.import("../hooks/useI18n.tsx");
const { AppRouterContext } = await import("next/dist/shared/lib/app-router-context.shared-runtime.js");
const { SearchParamsContext } = await import("next/dist/shared/lib/hooks-client-context.shared-runtime.js");

const router = {
  back() {},
  forward() {},
  refresh() {},
  push() {},
  replace() {},
  prefetch() {},
};

function appShellElement(searchParams = new URLSearchParams()) {
  return React.createElement(
    AppRouterContext.Provider,
    { value: router },
    React.createElement(
      SearchParamsContext.Provider,
      { value: searchParams },
      React.createElement(I18nProvider, null, React.createElement(AppShell)),
    ),
  );
}

async function mountAppShell(t, options = {}) {
  const previousFetch = globalThis.fetch;
  const previousMutationObserver = globalThis.MutationObserver;
  const previousMatchMedia = domWindow.matchMedia;
  domWindow.innerWidth = options.viewportWidth ?? 1200;
  domDocument.visibilityState = "hidden";
  domWindow.matchMedia = (query) => ({
    matches: query === "(max-width: 959px)" ? Boolean(options.compact) : false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  });
  globalThis.MutationObserver = class MutationObserver {
    observe() {}
    disconnect() {}
  };
  globalThis.fetch = async (input) => {
    const url = String(input);
    let body;
    if (url.startsWith("/api/sessions")) {
      body = { sessions: [], runningSessionIds: [] };
    } else if (url === "/api/agent/running") {
      body = { runningSessionIds: [] };
    } else if (url === "/api/home") {
      body = { home: "/Users/test" };
    } else if (url.startsWith("/api/theme")) {
      body = {
        names: { dark: "titanium", light: "light" },
        palettes: {
          dark: { name: "titanium", colorScheme: "dark", variables: {} },
          light: { name: "light", colorScheme: "light", variables: {} },
        },
      };
    } else {
      throw new Error(`Unexpected test request: ${url}`);
    }
    return { ok: true, status: 200, json: async () => structuredClone(body) };
  };
  t.after(() => {
    globalThis.fetch = previousFetch;
    globalThis.MutationObserver = previousMutationObserver;
    domWindow.matchMedia = previousMatchMedia;
  });
  const view = await mount(appShellElement());
  await settle();
  return view;
}

function renderHeader(activeTopPanel) {
  return renderToStaticMarkup(
    React.createElement(AppHeader, {
      activeTopPanel,
      panels: React.createElement("div", { "data-testid": "top-panel" }, "Panel"),
    }, React.createElement("nav", { "aria-label": "Session navigation" }, "Navigation")),
  );
}

test("the header renders one active top panel state", () => {
  const summary = renderHeader("summary");
  const closed = renderHeader(null);

  assert.match(summary, /data-summary-open="true"/);
  assert.match(closed, /data-summary-open="false"/);
  assert.match(summary, /<nav aria-label="Session navigation">Navigation<\/nav>/);
  assert.match(summary, /data-testid="top-panel">Panel/);
});

test("the shared header action renders an accessible button", () => {
  const markup = renderToStaticMarkup(
    React.createElement(HeaderAction, { "aria-label": "Branches" }, "Branches"),
  );

  assert.match(markup, /<button/);
  assert.match(markup, /type="button"/);
  assert.match(markup, /aria-label="Branches"/);
  assert.match(markup, /<span>Branches<\/span>/);
});

test("the Projects panel and Files panel keep independent visible states", async (t) => {
  const view = await mountAppShell(t);
  const projects = view.container.querySelector("#session-sidebar");
  const files = view.container.querySelector("#file-panel");

  assert.equal(projects.getAttribute("data-open"), "true");
  assert.equal(files.getAttribute("data-open"), "false");

  await click(view.container.querySelector("[aria-label='Hide sidebar']"));
  assert.equal(projects.getAttribute("data-open"), "false");
  assert.equal(files.getAttribute("data-open"), "false");

  await click(view.container.querySelector("[aria-label='Show file panel']"));
  assert.equal(projects.getAttribute("data-open"), "false");
  assert.equal(files.getAttribute("data-open"), "true");
  await view.unmount();
});

test("the Projects backdrop closes only the Projects panel", async (t) => {
  const view = await mountAppShell(t, { compact: true, viewportWidth: 800 });
  await click(view.container.querySelector("[aria-label='Show file panel']"));

  await click(view.container.querySelector("[data-testid='sidebar-backdrop']"));

  assert.equal(view.container.querySelector("#session-sidebar").getAttribute("data-open"), "false");
  assert.equal(view.container.querySelector("#file-panel").getAttribute("data-open"), "true");
  await view.unmount();
});

test("the Files backdrop closes only the Files panel", async (t) => {
  const view = await mountAppShell(t, { compact: true, viewportWidth: 800 });
  await click(view.container.querySelector("[aria-label='Show file panel']"));

  await click(view.container.querySelector("[data-testid='right-panel-backdrop']"));

  assert.equal(view.container.querySelector("#session-sidebar").getAttribute("data-open"), "true");
  assert.equal(view.container.querySelector("#file-panel").getAttribute("data-open"), "false");
  await view.unmount();
});

test("Escape closes both shell overlays in the compact layout", async (t) => {
  const view = await mountAppShell(t, { compact: true, viewportWidth: 800 });
  await click(view.container.querySelector("[aria-label='Show file panel']"));

  await press(domDocument, "Escape");

  assert.equal(view.container.querySelector("#session-sidebar").getAttribute("data-open"), "false");
  assert.equal(view.container.querySelector("#file-panel").getAttribute("data-open"), "false");
  await view.unmount();
});

test("the Projects resize limit responds when the Files panel opens", async (t) => {
  const view = await mountAppShell(t, { viewportWidth: 1200 });
  const projectsResize = view.container.querySelector("[data-resize-handle='sidebar']");
  assert.equal(projectsResize.getAttribute("aria-valuemax"), "480");

  await click(view.container.querySelector("[aria-label='Show file panel']"));
  await settle();

  assert.equal(projectsResize.getAttribute("aria-valuemax"), "276");
  await view.unmount();
});

test("the Files resize limit responds when the Projects panel closes", async (t) => {
  const view = await mountAppShell(t, { viewportWidth: 1200 });
  await click(view.container.querySelector("[aria-label='Show file panel']"));
  const filesResize = view.container.querySelector("[data-resize-handle='right-panel']");
  assert.equal(filesResize.getAttribute("aria-valuemax"), "505");

  await click(view.container.querySelector("[aria-label='Hide sidebar']"));
  await settle();

  assert.equal(filesResize.getAttribute("aria-valuemax"), "780");
  await view.unmount();
});

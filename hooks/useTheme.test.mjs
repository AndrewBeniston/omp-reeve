import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { WEB_THEME_VARIABLE_NAMES } = await jiti.import("../lib/theme-contract.ts");

function makeVariables(names = WEB_THEME_VARIABLE_NAMES, prefix = "value") {
  return Object.fromEntries(names.map((name, index) => [name, `${prefix}-${index}`]));
}

function makeConfig(darkVariables, lightVariables = darkVariables) {
  const palette = { name: "cached-dark", colorScheme: "dark", variables: darkVariables };
  return {
    names: { dark: "cached-dark", light: "cached-light" },
    palettes: {
      dark: palette,
      light: {
        ...palette,
        name: "cached-light",
        colorScheme: "light",
        variables: lightVariables,
      },
    },
  };
}

function createDom(initialPalette, options = {}) {
  function HTMLElement() {}
  function HTMLIFrameElement() {}

  const properties = new Map();
  const styleWrites = new Map();
  const classes = new Set();
  const dataset = {};
  const style = {
    colorScheme: "",
    setProperty(name, value) {
      styleWrites.set(name, value);
      if (value === "") properties.delete(name);
      else properties.set(name, value);
    },
    removeProperty(name) { properties.delete(name); },
  };
  const window = {
    HTMLElement,
    HTMLIFrameElement,
    innerWidth: 1200,
    innerHeight: 800,
    addEventListener() {},
    getSelection() { return null; },
    matchMedia(query) {
      return {
        matches: query === "(prefers-color-scheme: dark)" && options.systemDark !== false,
        addEventListener() {},
      };
    },
  };
  const document = {
    nodeType: 9,
    addEventListener() {},
    removeEventListener() {},
    defaultView: window,
    activeElement: null,
    visibilityState: "visible",
  };
  const container = {
    nodeType: 1,
    nodeName: "DIV",
    tagName: "DIV",
    namespaceURI: "http://www.w3.org/1999/xhtml",
    ownerDocument: document,
    dataset,
    style,
    classList: {
      toggle(name, enabled) {
        if (enabled) classes.add(name);
        else classes.delete(name);
      },
    },
    addEventListener() {},
    removeEventListener() {},
    appendChild() {},
    removeChild() {},
    textContent: "",
  };

  if (initialPalette) {
    for (const [name, value] of Object.entries(initialPalette.variables)) properties.set(name, value);
    dataset.ompThemeName = initialPalette.name;
    style.colorScheme = initialPalette.colorScheme;
    if (initialPalette.colorScheme === "dark") classes.add("dark");
  } else if (options.initialDark === true) {
    classes.add("dark");
  }
  window.document = document;
  document.documentElement = container;
  return { classes, container, dataset, document, properties, styleWrites, window };
}

async function mountThemeState(initialPalette, options = {}) {
  const previous = {
    actEnvironment: globalThis.IS_REACT_ACT_ENVIRONMENT,
    document: globalThis.document,
    fetch: globalThis.fetch,
    localStorage: globalThis.localStorage,
    window: globalThis.window,
  };
  const dom = createDom(initialPalette, options);
  const storage = new Map([["pi-theme", options.preference ?? "dark"]]);
  if (options.cachedConfig) storage.set("omp-theme-config", JSON.stringify(options.cachedConfig));

  globalThis.document = dom.document;
  globalThis.fetch = options.pendingThemeRequest
    ? () => new Promise(() => {})
    : async () => ({ ok: false, status: 500 });
  globalThis.localStorage = {
    getItem(key) { return storage.get(key) ?? null; },
    setItem(key, value) { storage.set(key, value); },
  };
  globalThis.window = dom.window;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  const { useTheme } = await createJiti(import.meta.url, {
    moduleCache: false,
    tsconfigPaths: true,
    tryNative: false,
  }).import("./useTheme.ts");

  let current;
  function Probe() {
    current = useTheme({ syncWithOmp: options.syncWithOmp === true });
    return null;
  }

  const root = createRoot(dom.container);
  await act(async () => root.render(React.createElement(Probe)));

  return {
    ...dom,
    get current() { return current; },
    async cleanup() {
      await act(async () => root.unmount());
      globalThis.document = previous.document;
      globalThis.fetch = previous.fetch;
      globalThis.localStorage = previous.localStorage;
      globalThis.window = previous.window;
      globalThis.IS_REACT_ACT_ENVIRONMENT = previous.actEnvironment;
    },
  };
}

async function mountFailedThemeRequest(cachedConfig, initialPalette) {
  return mountThemeState(initialPalette, { cachedConfig, syncWithOmp: true });
}

test("theme source preserves preferences, cached first paint, automatic mode, and reduced motion", async () => {
  const [source, layout] = await Promise.all([
    readFile(new URL("useTheme.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(source, /const STORAGE_KEY = "pi-theme"/);
  assert.match(source, /const THEME_MODE_KEY = "omp-theme"/);
  assert.match(source, /const THEME_CONFIG_KEY = "omp-theme-config"/);
  assert.match(source, /\["light", "dark", "auto"\]/);
  assert.match(source, /prefers-color-scheme: dark/);
  assert.match(source, /addEventListener\("change", syncAutoThemeFromSystem\)/);
  assert.match(source, /addEventListener\("focus", syncAutoThemeFromSystem\)/);
  assert.match(source, /visibilitychange/);
  assert.match(source, /prefers-reduced-motion: reduce/);
  assert.match(source, /if \(!supportsVT \|\| reduceMotion\)/);
  assert.match(layout, /localStorage\.getItem\("omp-theme-config"\)/);
  assert.equal(WEB_THEME_VARIABLE_NAMES.length, 26);
  assert.match(source, /hasCompleteWebThemeVariables\(candidate\.variables\)/);
  assert.match(layout, /JSON\.stringify\(WEB_THEME_VARIABLE_NAMES\)/);
  assert.match(layout, /v\.every\(function\(k\)\{return typeof p\.variables\[k\]===\"string\"\}\)/);
});

test("automatic light mode replaces a complete dark first-paint palette with the cached light palette", async (t) => {
  const darkVariables = makeVariables(WEB_THEME_VARIABLE_NAMES, "dark");
  const lightVariables = makeVariables(WEB_THEME_VARIABLE_NAMES, "light");
  const cachedConfig = makeConfig(darkVariables, lightVariables);
  const mounted = await mountThemeState(cachedConfig.palettes.dark, {
    cachedConfig,
    preference: "auto",
    systemDark: false,
  });
  t.after(() => mounted.cleanup());

  assert.equal(mounted.current.preference, "auto");
  assert.equal(mounted.current.theme, "light");
  assert.equal(mounted.dataset.ompThemeMode, "light");
  for (const name of WEB_THEME_VARIABLE_NAMES) {
    assert.equal(mounted.properties.get(name), lightVariables[name]);
  }
  assert.equal(mounted.dataset.ompThemeName, "cached-light");
  assert.equal(mounted.container.style.colorScheme, "light");
  assert.ok(!mounted.classes.has("dark"));
});

test("theme toggle applies the complete palette while the theme request remains pending", async (t) => {
  const darkVariables = makeVariables(WEB_THEME_VARIABLE_NAMES, "dark");
  const lightVariables = makeVariables(WEB_THEME_VARIABLE_NAMES, "light");
  const cachedConfig = makeConfig(darkVariables, lightVariables);
  const mounted = await mountThemeState(cachedConfig.palettes.dark, {
    cachedConfig,
    pendingThemeRequest: true,
    preference: "dark",
    syncWithOmp: true,
    systemDark: false,
  });
  t.after(() => mounted.cleanup());

  await act(async () => mounted.current.toggleTheme());

  assert.equal(mounted.current.preference, "auto");
  assert.equal(mounted.current.theme, "light");
  assert.equal(mounted.dataset.ompThemeMode, "light");
  for (const name of WEB_THEME_VARIABLE_NAMES) {
    assert.equal(mounted.properties.get(name), lightVariables[name]);
  }
  assert.equal(mounted.dataset.ompThemeName, "cached-light");
  assert.equal(mounted.container.style.colorScheme, "light");
  assert.ok(!mounted.classes.has("dark"));
});

test("theme toggle changes the dark class after a failed request without a cache", async (t) => {
  const mounted = await mountThemeState(undefined, {
    initialDark: true,
    syncWithOmp: true,
    systemDark: false,
  });
  t.after(() => mounted.cleanup());

  assert.ok(mounted.classes.has("dark"));
  await act(async () => mounted.current.toggleTheme());
  assert.ok(!mounted.classes.has("dark"));
});

test("a loaded legacy twenty-variable cache clears all first-paint palette variables", async (t) => {
  const legacyNames = WEB_THEME_VARIABLE_NAMES.filter((name) => !name.startsWith("--syntax-"));
  assert.equal(legacyNames.length, 20);
  const firstPaintPalette = { name: "first-paint-dark", colorScheme: "dark", variables: makeVariables() };
  const mounted = await mountFailedThemeRequest(
    makeConfig(makeVariables(legacyNames)),
    firstPaintPalette,
  );
  t.after(() => mounted.cleanup());

  assert.equal(mounted.properties.size, 0);
  for (const name of WEB_THEME_VARIABLE_NAMES) assert.equal(mounted.styleWrites.get(name), "");
  assert.equal(mounted.dataset.ompThemeName, undefined);
  assert.equal(mounted.container.style.colorScheme, "");
  assert.ok(mounted.classes.has("dark"));
});

test("a failed theme request applies a complete twenty-six-variable cache", async (t) => {
  const variables = makeVariables();
  const mounted = await mountFailedThemeRequest(makeConfig(variables));
  t.after(() => mounted.cleanup());

  assert.equal(mounted.properties.size, 26);
  for (const name of WEB_THEME_VARIABLE_NAMES) {
    assert.equal(mounted.properties.get(name), variables[name]);
  }
  assert.equal(mounted.dataset.ompThemeName, "cached-dark");
  assert.equal(mounted.container.style.colorScheme, "dark");
  assert.ok(mounted.classes.has("dark"));
});

test("refreshOmpTheme caches and applies the selected OMP palette", async () => {
  const storage = new Map([["pi-theme", "dark"]]);
  const properties = new Map();
  const dataset = {};
  const classes = new Set();
  let request;
  const variables = makeVariables();

  globalThis.localStorage = {
    getItem(key) { return storage.get(key) ?? null; },
    setItem(key, value) { storage.set(key, value); },
  };
  globalThis.window = {
    innerWidth: 1200,
    innerHeight: 800,
    addEventListener() {},
    matchMedia(query) {
      return { matches: query === "(prefers-color-scheme: dark)", addEventListener() {} };
    },
  };
  globalThis.document = {
    visibilityState: "visible",
    addEventListener() {},
    documentElement: {
      dataset,
      classList: {
        toggle(name, enabled) {
          if (enabled) classes.add(name);
          else classes.delete(name);
        },
      },
      style: {
        setProperty(name, value) { properties.set(name, value); },
        removeProperty(name) { properties.delete(name); },
        colorScheme: "",
      },
    },
  };
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      async json() {
        return {
          names: { dark: "titanium", light: "light" },
          palettes: {
            dark: {
              name: "titanium",
              colorScheme: "dark",
              variables,
            },
            light: {
              name: "light",
              colorScheme: "light",
              variables,
            },
          },
        };
      },
    };
  };

  const { refreshOmpTheme } = await createJiti(import.meta.url, {
    moduleCache: false,
    tsconfigPaths: true,
    tryNative: false,
  }).import("./useTheme.ts");
  await refreshOmpTheme("/tmp/theme fixture");

  assert.deepEqual(request, {
    url: "/api/theme?cwd=%2Ftmp%2Ftheme%20fixture",
    options: { cache: "no-store" },
  });
  assert.equal(dataset.ompThemeMode, "dark");
  assert.equal(dataset.ompThemeName, "titanium");
  assert.equal(properties.size, 26);
  assert.equal(properties.get("--bg"), variables["--bg"]);
  assert.equal(properties.get("--syntax-warning"), variables["--syntax-warning"]);
  assert.equal(document.documentElement.style.colorScheme, "dark");
  assert.ok(classes.has("dark"));
  assert.equal(storage.get("omp-theme"), "dark");
  assert.equal(JSON.parse(storage.get("omp-theme-config")).names.dark, "titanium");
});

import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
import { React, click, mount, settle, textOf } from "../../test/dom-harness.mjs";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { ComposerProjectControl } = await jiti.import("./ComposerProjectControl.tsx");
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
}];

function response(body, ok = true) {
  return { ok, status: ok ? 200 : 400, json: async () => body };
}

test("selects a Reeve project and opens through its command handle", async (t) => {
  const previousFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = previousFetch; });
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith("/api/sessions")) return response({ sessions, projectOrder: ["/repos/omp-web"] });
    if (String(url) === "/api/cwd/validate" && options?.method === "POST") {
      return response({ cwd: JSON.parse(options.body).cwd });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };
  let selected = null;
  const ref = React.createRef();
  const view = await mount(h(I18nProvider, null, h(ComposerProjectControl, {
    ref,
    selectedPath: "/repos/omp-web",
    onSelect: (path) => { selected = path; },
  })));

  ref.current.open();
  await settle();
  const item = Array.from(view.container.querySelectorAll("[role='menuitemradio']"))
    .find((candidate) => textOf(candidate).includes("OMP Web"));
  assert.ok(item);
  await click(item);
  await settle();

  assert.equal(selected, "/repos/omp-web");
  await view.unmount();
});

test("keeps cloud and remote unavailable with reasons", async () => {
  const view = await mount(h(I18nProvider, null, h(ComposerProjectControl, {
    selectedPath: "/repos/omp-web",
    onSelect() {},
  })));
  const trigger = view.container.querySelector("[aria-haspopup='menu']");
  await click(trigger);
  await settle();

  const cloud = Array.from(view.container.querySelectorAll("[role='menuitem']"))
    .find((item) => textOf(item).includes("Cloud"));
  const remote = Array.from(view.container.querySelectorAll("[role='menuitem']"))
    .find((item) => textOf(item).includes("Remote"));
  assert.match(textOf(cloud), /Reeve has no cloud run location/);
  assert.match(textOf(remote), /Reeve has no remote run location/);
  assert.equal(cloud?.hasAttribute("disabled"), true);
  assert.equal(remote?.hasAttribute("disabled"), true);
  await view.unmount();
});

test("cancels an existing Session move without sending a relocation request", async (t) => {
  const previousFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = previousFetch; });
  let relocationCalls = 0;
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith("/api/sessions")) return response({ sessions, projectOrder: ["/repos/omp-web"] });
    if (String(url) === "/api/cwd/validate" && options?.method === "POST") {
      return response({ cwd: JSON.parse(options.body).cwd });
    }
    if (String(url).endsWith("/workspace")) {
      relocationCalls += 1;
      return response({});
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  const view = await mount(h(I18nProvider, null, h(ComposerProjectControl, {
    selectedPath: "/repos/omp-web",
    sessionId: "session-one",
    hasUnsentInput: true,
    onSelect() {},
    onRelocated() {},
  })));
  const trigger = view.container.querySelector("[aria-haspopup='menu']");
  await click(trigger);
  await settle();
  const item = Array.from(view.container.querySelectorAll("[role='menuitemradio']"))
    .find((candidate) => textOf(candidate).includes("OMP Web"));
  assert.ok(item);
  await click(item);
  await settle();

  const dialog = document.querySelector("[role='dialog']");
  assert.ok(dialog);
  assert.match(textOf(dialog), /Move this session\?/);
  await click(Array.from(dialog.querySelectorAll("button")).find((button) => textOf(button) === "Cancel"));
  await settle();

  assert.equal(relocationCalls, 0);
  await view.unmount();
});

test("moves an existing Session through the workspace route after confirmation", async (t) => {
  const previousFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = previousFetch; });
  let relocationRequest = null;
  let relocated = null;
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith("/api/sessions?")) return response({ sessions, projectOrder: ["/repos/omp-web"] });
    if (String(url) === "/api/cwd/validate" && options?.method === "POST") {
      return response({ cwd: JSON.parse(options.body).cwd });
    }
    if (String(url) === "/api/sessions/session-one/workspace" && options?.method === "POST") {
      relocationRequest = JSON.parse(options.body);
      return response({ sessionId: "session-one", sessionFile: "/sessions/one.jsonl", cwd: "/repos/omp-web", projectRoot: "/repos/omp-web", trust: { trusted: true } });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  const view = await mount(h(I18nProvider, null, h(ComposerProjectControl, {
    selectedPath: "/repos/old",
    sessionId: "session-one",
    hasUnsentInput: true,
    onSelect() {},
    onRelocated(result) { relocated = result; },
  })));
  const trigger = view.container.querySelector("[aria-haspopup='menu']");
  await click(trigger);
  await settle();
  const item = Array.from(view.container.querySelectorAll("[role='menuitemradio']"))
    .find((candidate) => textOf(candidate).includes("OMP Web"));
  assert.ok(item);
  await click(item);
  await settle();
  const dialog = document.querySelector("[role='dialog']");
  assert.ok(dialog);
  await click(Array.from(dialog.querySelectorAll("button")).find((button) => textOf(button) === "Move session"));
  await settle();

  assert.deepEqual(relocationRequest, { cwd: "/repos/omp-web" });
  assert.equal(relocated?.sessionId, "session-one");
  assert.equal(relocated?.cwd, "/repos/omp-web");
  await view.unmount();
});

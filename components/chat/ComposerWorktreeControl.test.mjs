import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
import { React, click, mount, settle, textOf } from "../../test/dom-harness.mjs";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { ComposerWorktreeControl, worktreeCreateRequest } = await jiti.import("./ComposerWorktreeControl.tsx");
const { I18nProvider } = await jiti.import("../../hooks/useI18n.tsx");
const h = React.createElement;

function response(body, ok = true) {
  return { ok, status: ok ? 200 : 400, json: async () => body };
}

test("passes the selected starting branch when creating a worktree", async (t) => {
  const previousFetch = globalThis.fetch;
  let requestBody;
  t.after(() => { globalThis.fetch = previousFetch; });
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith("/api/worktrees?") && options?.method === undefined) {
      return response({
        isGit: true,
        isTopLevel: true,
        worktrees: [{ path: "/repo", branch: "main", isMain: true, isDetached: false, isDirty: false }],
      });
    }
    if (String(url) === "/api/worktrees" && options?.method === "POST") {
      requestBody = JSON.parse(options.body);
      return response({ path: "/repo-worktrees/feature" });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  const ref = React.createRef();
  let selected;
  const view = await mount(h(I18nProvider, null, h(ComposerWorktreeControl, {
    ref,
    cwd: "/repo",
    onSelect: (path) => { selected = path; },
  })));
  ref.current.open();
  await settle();
  await click(Array.from(view.container.querySelectorAll("[role='menuitem']"))
    .find((item) => textOf(item) === "New worktree…"));
  assert.ok(view.container.querySelector("[aria-label='Starting branch']"));
  assert.deepEqual(worktreeCreateRequest("/repo", " feature ", " base "), {
    cwd: "/repo",
    branch: "feature",
    startingState: "base",
  });
  assert.equal(requestBody, undefined);
  assert.equal(selected, undefined);
  await view.unmount();
});

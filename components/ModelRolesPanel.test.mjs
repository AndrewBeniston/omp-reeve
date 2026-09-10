import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const { ModelRolesPanel } = await jiti.import("./ModelRolesPanel.tsx");
const { resolveRoleModelChange } = await jiti.import("./models/role-selector-change.ts");
const { I18nProvider } = await jiti.import("../hooks/useI18n.tsx");

const source = await readFile(new URL("./ModelRolesPanel.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("./ModelRolesPanel.module.css", import.meta.url), "utf8");

function render(props) {
  return renderToStaticMarkup(
    React.createElement(I18nProvider, null, React.createElement(ModelRolesPanel, props)),
  );
}

test("without a project the panel asks for one instead of showing roles", () => {
  const html = render({ cwd: null });

  assert.match(html, /Open a project to edit its model roles\./);
  assert.doesNotMatch(html, /role="group"/);
});

test("with a project the panel offers both save scopes as pressed-state controls", () => {
  const html = render({ cwd: "/tmp/project" });

  assert.match(html, /Model roles/);
  assert.match(html, /<div role="group" aria-label="Save to"/);
  assert.match(html, /<button[^>]*aria-pressed="true"[^>]*>.*?Global/s);
  assert.match(html, /<button[^>]*aria-pressed="false"[^>]*>.*?This project/s);
  assert.match(html, /~\/\.omp\/agent\/config\.yml/);
});

test("the panel keeps the shared settings primitives and adds no raw button", () => {
  for (const primitive of ["Button", "StatusBadge", "Surface", "Tooltip"]) {
    assert.match(source, new RegExp(`import \\{ ${primitive} \\} from "\\./ui/${primitive}"`));
  }
  assert.doesNotMatch(source, /<button\b/);
  assert.match(source, /<Surface\b/);
  assert.match(source, /<StatusBadge\b/);
  assert.match(source, /<Tooltip\b/);
});

test("the panel writes a role through the model-roles route", () => {
  assert.match(source, /\/api\/model-roles/);
  assert.match(source, /method: "PUT"/);
  assert.match(source, /aria-pressed=\{active\}/);
});

test("picking a model keeps a supported thinking level and drops an unsupported one", () => {
  assert.equal(
    resolveRoleModelChange({
      value: "anthropic/claude",
      currentSelector: "openai/gpt-5:high",
      supportedLevels: ["high"],
    }),
    "anthropic/claude:high",
  );
  assert.equal(
    resolveRoleModelChange({
      value: "anthropic/claude",
      currentSelector: "openai/gpt-5:high",
      supportedLevels: ["low"],
    }),
    "anthropic/claude",
  );
  assert.equal(resolveRoleModelChange({ value: "" }), null);
});

test("every own control in the panel shows a 2px focus ring with a 2px offset", () => {
  const focusRules = css.match(/:focus-visible[^{]*\{[^}]*\}/g) ?? [];

  assert.ok(focusRules.length >= 3, "the scope, model and thinking controls each need a ring");
  for (const rule of focusRules) {
    assert.match(rule, /outline: var\(--ui-focus-ring\)/, rule);
    assert.match(rule, /outline-offset:.*var\(--ui-focus-offset\)/, rule);
  }
});

test("the panel raises its controls to the touch target size", () => {
  const touchBlocks = css.match(/@media[^{]*pointer: coarse[^{]*\{[\s\S]*?\n\}/g) ?? [];

  assert.equal(touchBlocks.length, 1);
  assert.match(touchBlocks[0], /min-height: var\(--ui-control-touch\)/);
  assert.match(touchBlocks[0], /min-width: var\(--ui-control-touch\)/);
});

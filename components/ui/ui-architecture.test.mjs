import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });

test("the style system resolves class names through one typed interface", async () => {
  const { cx, ui } = await jiti.import("../../lib/ui/index.ts");

  assert.equal(cx("alpha", false, null, "beta", undefined), "alpha beta");
  const danger = ui("button", { tone: "danger", size: "sm", fullWidth: true });
  assert.equal(danger, ui("button", { tone: "danger", size: "sm", fullWidth: true }));
  assert.notEqual(danger, ui("button", { tone: "primary", size: "sm" }));
  assert.throws(() => ui("missing"), /Unknown UI recipe/);
  assert.throws(() => ui("button", { tone: "missing" }), /Unknown button tone/);
});

test("dynamic style variable names come from one tuple", async () => {
  const source = await readFile(new URL("./DynamicStyleVars.tsx", import.meta.url), "utf8");
  assert.match(source, /const DYNAMIC_STYLE_VARIABLES = \[[\s\S]*?\] as const;/);
  assert.match(
    source,
    /export type DynamicStyleVariable = \(typeof DYNAMIC_STYLE_VARIABLES\)\[number\];/,
  );

  for (const name of [
    "--ui-panel-width",
    "--ui-composer-height",
    "--ui-scroll-offset",
    "--ui-tree-depth",
    "--ui-progress",
    "--ui-minimap-offset",
    "--ui-preview-aspect-ratio",
    "--ui-animation-origin-x",
    "--ui-animation-origin-y",
    "--ui-queue-translate-x",
    "--ui-queue-translate-y",
    "--ui-project-translate-x",
    "--ui-project-translate-y",
  ]) {
    assert.equal(source.split(name).length - 1, 1, `${name} must have one declaration`);
  }
});

test("the recipe definitions export the canonical variant map", async () => {
  const [recipesSource, indexSource] = await Promise.all([
    readFile(new URL("../../lib/ui/recipes.ts", import.meta.url), "utf8"),
    readFile(new URL("../../lib/ui/index.ts", import.meta.url), "utf8"),
  ]);

  assert.match(recipesSource, /export type RecipeVariants =/);
  assert.match(indexSource, /export type \{ RecipeVariants \} from "\.\/recipes";/);
  assert.doesNotMatch(indexSource, /interface RecipeVariants/);
});

test("primitives stay independent from OMP behavior and application hooks", async () => {
  const files = [
    "Button.tsx",
    "IconButton.tsx",
    "Surface.tsx",
    "StatusBadge.tsx",
    "Disclosure.tsx",
    "Dialog.tsx",
    "Menu.tsx",
    "Tabs.tsx",
    "Tooltip.tsx",
    "FormField.tsx",
    "VisuallyHidden.tsx",
    "DynamicStyleVars.tsx",
  ];

  for (const file of files) {
    const source = await readFile(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(source, /(?:from\s+["'][^"']*hooks|@\/hooks)/, file);
    assert.doesNotMatch(source, /@oh-my-pi|omp-types|AgentSession|ToolCallContent/, file);
    assert.doesNotMatch(source, /\bfetch\s*\(/, file);
    if (file !== "DynamicStyleVars.tsx") {
      assert.doesNotMatch(source, /\bstyle\s*[?:=]/, file);
    }
  }
});

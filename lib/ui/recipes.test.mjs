import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });

function declaredClasses(css) {
  const names = new Set();
  for (const block of css.split("{")) {
    const selector = block.split("}").pop() ?? "";
    for (const match of selector.matchAll(/\.([A-Za-z][\w-]*)/g)) names.add(match[1]);
  }
  return names;
}

function referencedClasses(source) {
  const names = new Set();
  for (const match of source.matchAll(/\bstyles\.([A-Za-z][\w-]*)/g)) names.add(match[1]);
  return names;
}

test("every recipe class name exists in recipes.module.css", async () => {
  const [css, source] = await Promise.all([
    readFile(new URL("./recipes.module.css", import.meta.url), "utf8"),
    readFile(new URL("./recipes.ts", import.meta.url), "utf8"),
  ]);

  const declared = declaredClasses(css);
  const referenced = referencedClasses(source);
  assert.ok(referenced.size > 0, "recipes.ts must read class names from the CSS module");

  const missing = [...referenced].filter((name) => !declared.has(name));
  assert.deepEqual(missing, [], "recipes.ts reads a class that the stylesheet does not declare");

  const unused = [...declared].filter((name) => !referenced.has(name));
  assert.deepEqual(unused, [], "recipes.module.css declares a class that no recipe reads");
});

test("the recipe lookup reports a missing class instead of using the property name", async () => {
  const { resolveRecipeClass } = await jiti.import("./recipes.ts");

  const compiled = { button: "recipes_button__a1b2", dialog: "recipes_dialog__c3d4" };
  assert.equal(resolveRecipeClass(compiled, "button"), "recipes_button__a1b2");
  assert.throws(
    () => resolveRecipeClass(compiled, "dialogFullWindow"),
    /Missing CSS module class in recipes.module.css: dialogFullWindow/,
  );
  assert.throws(() => resolveRecipeClass({ button: "" }, "button"), /Missing CSS module class/);

  // A runtime without the CSS module pipeline imports an empty object. The
  // test above guards that runtime, so the plain name stays safe here.
  assert.equal(resolveRecipeClass({}, "dialogFullWindow"), "dialogFullWindow");
});

test("the dialog recipe carries one class per presentation", async () => {
  const { ui } = await jiti.import("./index.ts");

  const centered = ui("dialog", { presentation: "centered", size: "sm" });
  const full = ui("dialog", { presentation: "fullWindow" });

  assert.match(centered, /dialogCentered/);
  assert.match(centered, /dialogSm/);
  assert.match(full, /dialogFullWindow/);
  assert.doesNotMatch(full, /dialogSm|dialogMd|dialogLg/);
  assert.match(ui("dialogBackdrop", { open: true, presentation: "fullWindow" }), /dialogBackdropFullWindow/);
  assert.throws(() => ui("dialog", { presentation: "sheet" }), /Unknown dialog presentation: sheet/);
});

test("recipes follow verified Codex geometry contracts", async () => {
  const css = await readFile(new URL("./recipes.module.css", import.meta.url), "utf8");

  assert.match(
    css,
    /\.menuSurface\s*\{[^}]*border-radius:\s*15px;[^}]*corner-shape:\s*superellipse\(1\.5\);[^}]*padding:\s*6px;/,
  );

  assert.match(
    css,
    /\.menuItemSurface\s*\{[^}]*min-height:\s*30px;[^}]*border-radius:\s*9px;[^}]*corner-shape:\s*superellipse\(1\.5\);[^}]*padding:\s*6px 8px;/,
  );
  assert.match(
    css,
    /\.menuItem\s*\{[^}]*gap:\s*6px;[^}]*font-size:\s*13px;[^}]*line-height:\s*18px;/,
  );

  assert.match(
    css,
    /\.dialog\s*\{[^}]*border-radius:\s*15px;[^}]*corner-shape:\s*superellipse\(1\.5\);[^}]*padding:\s*20px;/,
  );

  assert.match(
    css,
    /\.tooltipBubble\s*\{[^}]*border-radius:\s*10px;[^}]*corner-shape:\s*superellipse\(1\.5\);[^}]*padding:\s*2px 8px;[^}]*font-size:\s*13px;[^}]*line-height:\s*1\.45;/,
  );
});

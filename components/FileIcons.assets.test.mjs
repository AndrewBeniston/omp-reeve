import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { getFileIcon, FolderIcon } = await jiti.import("./FileIcons.tsx");

const at = (relative) => fileURLToPath(new URL(relative, import.meta.url));
const css = readFileSync(at("./navigation/navigation.module.css"), "utf8");
const source = readFileSync(at("./FileIcons.tsx"), "utf8");

/** Every icon name the component can put in the markup. */
const names = (source.match(/type CatppuccinIconName =[\s\S]*?;/)?.[0] ?? "")
  .match(/"([^"]+)"/g)
  ?.map((quoted) => quoted.slice(1, -1)) ?? [];

/*
 * The gap this covers: a name reaching the markup proves nothing on its own.
 * Until every name had a rule of its own, a TypeScript file carried
 * data-icon="typescript" and still drew the generic outline, because the
 * stylesheet mapped three names and fell through for the rest.
 */
test("every icon name is mapped to an asset that is actually shipped", () => {
  assert.ok(names.length >= 30, "the icon names could not be read from the source");
  // Every .fileIcon rule that names assets, keyed by the icon it is for. The
  // bare selector is the fallback every unlisted name lands on.
  const assets = new Map();
  for (const [, attribute, name, body] of css.matchAll(/\.fileIcon(\[data-icon="([^"]+)"\])?\s*\{([^}]*)\}/g)) {
    const urls = [...body.matchAll(/url\("([^"]+)"\)/g)].map((match) => match[1]);
    if (urls.length) assets.set(attribute ? name : "_file", urls);
  }
  for (const name of names) {
    const urls = assets.get(name);
    assert.ok(urls, "no asset rule for " + name);
    assert.equal(urls.length, 2, name + " needs a light and a dark asset");
    for (const url of urls) {
      assert.ok(url.endsWith("/" + name + ".svg"), name + " points at " + url);
      assert.ok(existsSync(at("../public" + url)), "missing asset " + url);
    }
  }
});

test("a typed icon keeps its own colours, and a generic one is tinted", () => {
  const typed = renderToStaticMarkup(React.createElement(React.Fragment, null, getFileIcon("lib/a.ts")));
  assert.match(typed, /data-icon="typescript"/);
  assert.match(typed, /data-typed=""/);
  // The three generic ones stay on the mask, so they follow the interface text.
  const generic = renderToStaticMarkup(React.createElement(React.Fragment, null, getFileIcon("LICENSE")));
  assert.match(generic, /data-icon="_file"/);
  assert.doesNotMatch(generic, /data-typed/);
  assert.doesNotMatch(renderToStaticMarkup(React.createElement(FolderIcon, { open: true })), /data-typed/);
});

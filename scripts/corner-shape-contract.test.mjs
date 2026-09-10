import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";

const root = join(import.meta.dir, "..");
const sourceRoots = ["app", "components", "lib"];

function cssFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return cssFiles(path);
    return entry.isFile() && entry.name.endsWith(".css") ? [path] : [];
  });
}

test("rounded surfaces use superellipses while circles and pills stay round", () => {
  const globals = readFileSync(join(root, "app", "globals.css"), "utf8");
  assert.match(globals, /@supports \(corner-shape: superellipse\(1\.5\)\)/);
  assert.match(
    globals,
    /:where\(\*, \*::before, \*::after\)\s*\{\s*corner-shape: var\(--corner-row\)/,
  );
  const tokens = readFileSync(join(root, "app", "tokens.css"), "utf8");
  assert.match(tokens, /--corner-round:\s*round/);

  const missingRoundOverride = [];
  for (const sourceRoot of sourceRoots) {
    for (const file of cssFiles(join(root, sourceRoot))) {
      const blocks = readFileSync(file, "utf8").match(/[^{}]+\{[^{}]*\}/g) ?? [];
      for (const block of blocks) {
        if (!/border-radius:\s*(?:var\(--radius-round\)|999px|50%)/.test(block)) continue;
        if (!/corner-shape:\s*var\(--corner-round\)/.test(block)) {
          missingRoundOverride.push(relative(root, file));
        }
      }
    }
  }

  assert.deepEqual([...new Set(missingRoundOverride)], []);
});

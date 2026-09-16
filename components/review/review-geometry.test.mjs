import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const repoFile = (path) => new URL(`../../${path}`, import.meta.url);

/*
 * R20's hover wash and corner belong to Review alone. These assertions hold the
 * boundary: Review carries the reference's values, and the global tokens and
 * recipes keep Reeve's own.
 */

test("Review scopes R20's hover wash to its own panel", async () => {
  const review = await readFile(repoFile("components/review/review.module.css"), "utf8");

  assert.match(review, /\.panel\s*\{[^}]*--ui-hover:\s*color-mix\(in srgb, var\(--ui-text\) 8%, transparent\);/s);
  assert.match(review, /:global\(html\.dark\)\s*\.panel\s*\{[^}]*--ui-hover:\s*color-mix\(in srgb, var\(--ui-text\) 12%, transparent\);/s);
});

test("the shared control corner is a hook Review sets and nothing else does", async () => {
  const recipes = await readFile(repoFile("lib/ui/recipes.module.css"), "utf8");
  const review = await readFile(repoFile("components/review/review.module.css"), "utf8");

  assert.match(recipes, /\.button\s*\{[^}]*corner-shape:\s*var\(--ui-control-corner, round\);/s);
  assert.match(recipes, /\.iconButton\s*\{[^}]*corner-shape:\s*var\(--ui-control-corner, round\);/s);
  assert.doesNotMatch(recipes, /--ui-control-corner:/);

  const supports = /@supports \(corner-shape: superellipse\(1\.5\)\)\s*\{(?<body>[\s\S]*?)\n\}/.exec(review)?.groups?.body ?? "";
  assert.match(supports, /--ui-control-corner:\s*superellipse\(1\.5\);/);
});

test("Review's overrides leave the global tokens alone", async () => {
  const tokens = await readFile(repoFile("app/tokens.css"), "utf8");

  assert.match(tokens, /--ui-hover:\s*var\(--bg-hover\);/);
  assert.match(tokens, /--ui-row-hover:\s*color-mix\(in srgb, var\(--text\) 5%, transparent\);/);
  assert.doesNotMatch(tokens, /--ui-control-corner:/);
});

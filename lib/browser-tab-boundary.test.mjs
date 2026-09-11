import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

/**
 * The renderer imports the Tab store, so the store must stay free of node.
 *
 * This is not theoretical. Putting the registry and the pure decisions in one
 * module pulled the whole OMP SDK into the client bundle through session-reader
 * and broke the build, while typecheck, lint and every test stayed green.
 */
test("the Browser tab store stays out of node, because the renderer imports it", () => {
  const source = readFileSync(join(import.meta.dir, "browser-tab-store.ts"), "utf8");

  assert.doesNotMatch(source, /from "(node:)?(fs|path|os|crypto)"/);
  assert.doesNotMatch(source, /session-reader|getAgentDir/);
  assert.doesNotMatch(source, /@oh-my-pi/);
});

test("the registry is the half that touches disk, and nothing in the renderer imports it", () => {
  const registry = readFileSync(join(import.meta.dir, "browser-tab-registry.ts"), "utf8");
  assert.match(registry, /from "fs"/);
  assert.match(registry, /getAgentDir/);

  // Reeve keeps this outside OMP's own files, following the archived-Session
  // precedent: OMP owns Sessions, and a panel Tab is not one.
  assert.match(registry, /omp-web-browser-tabs\.json/);

  const shell = readFileSync(join(import.meta.dir, "..", "components", "AppShell.tsx"), "utf8");
  assert.doesNotMatch(shell, /browser-tab-registry/);
  assert.match(shell, /browser-tab-store/);
});

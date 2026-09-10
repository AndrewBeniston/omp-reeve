import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = join(import.meta.dir, "..");

test("Reeve cannot publish a public npm release", () => {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const updateWorkflow = readFileSync(join(root, ".github", "workflows", "update-omp.yml"), "utf8");
  const compose = readFileSync(join(root, "docker-compose.yml"), "utf8");

  assert.equal(pkg.private, true);
  // The release script cuts a Git tag for the GitHub publish workflow. It never runs npm publish.
  assert.equal(pkg.scripts.release, "bun scripts/release.mjs");
  const releaseScript = readFileSync(join(root, "scripts", "release.mjs"), "utf8");
  assert.doesNotMatch(releaseScript, /npm publish|bun publish/);
  assert.equal(existsSync(join(root, ".github", "workflows", "publish-npm.yml")), false);
  assert.equal(existsSync(join(root, ".claude", "skills", "github-release", "SKILL.md")), false);
  assert.equal(existsSync(join(root, "app", "api", "updates", "route.ts")), false);
  assert.doesNotMatch(updateWorkflow, /run:\s+npm publish|Start npm publish|name:\s+Release omp-web/);
  assert.match(compose, /omp-reeve:/);
  assert.match(compose, /image:\s+omp-reeve:local/);
  assert.doesNotMatch(compose, /^\s{2}omp-web:/m);
});

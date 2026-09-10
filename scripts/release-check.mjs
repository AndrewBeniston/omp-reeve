#!/usr/bin/env bun
/**
 * bun run release:check [--tag vX.Y.Z]
 * Exits 1 with a list of problems when the repository is not release-ready.
 * CI runs it on every push, and the publish workflow runs it with the tag.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { releaseProblems } from "./release-core.mjs";

const root = join(import.meta.dir, "..");
const argv = process.argv.slice(2);
const tagIndex = argv.indexOf("--tag");
const tag = tagIndex === -1 ? null : argv[tagIndex + 1] ?? null;

const problems = releaseProblems({
  changelog: readFileSync(join(root, "CHANGELOG.md"), "utf8"),
  packageVersion: JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version,
  desktopVersion: JSON.parse(readFileSync(join(root, "desktop", "package.json"), "utf8")).version,
  tag,
});

if (problems.length) {
  for (const problem of problems) console.error(`[release-check] ${problem}`);
  process.exit(1);
}
console.log(`[release-check] ok${tag ? ` for ${tag}` : ""}`);

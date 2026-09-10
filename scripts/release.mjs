#!/usr/bin/env bun
/**
 * bun run release [--dry-run] [--patch|--minor|--major|--version X.Y.Z] [--support] [--yes]
 *
 * Reads [Unreleased] in CHANGELOG.md, proposes the next version, waits for a
 * yes, then bumps both package files, moves the changelog entries under a
 * dated header, commits, and tags v<version>. Push the tag by hand:
 *
 *   git push origin main --follow-tags
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { bumpVersion, cutRelease, proposeBump, unreleasedRelease } from "./release-core.mjs";

const root = join(import.meta.dir, "..");
const argv = process.argv.slice(2);
const args = new Set(argv);
const versionIndex = argv.indexOf("--version");
const explicitVersion = versionIndex === -1 ? null : argv[versionIndex + 1] ?? null;
if (versionIndex !== -1 && !/^\d+\.\d+\.\d+$/.test(explicitVersion ?? "")) {
  console.error("[release] --version needs X.Y.Z");
  process.exit(1);
}
const dryRun = args.has("--dry-run");
const forced = ["major", "minor", "patch"].find((kind) => args.has(`--${kind}`)) ?? null;
const supportFlag = args.has("--support");
const yes = args.has("--yes");

function git(...argv) {
  const result = spawnSync("git", argv, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${argv.join(" ")} failed: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

const changelogPath = join(root, "CHANGELOG.md");
const packagePath = join(root, "package.json");
const desktopPackagePath = join(root, "desktop", "package.json");

const changelog = readFileSync(changelogPath, "utf8");
const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
const desktopPkg = JSON.parse(readFileSync(desktopPackagePath, "utf8"));

if (!dryRun && git("status", "--porcelain")) {
  console.error("[release] the working tree is not clean. Commit or stash first.");
  process.exit(1);
}
if (!dryRun && git("branch", "--show-current") !== "main") {
  console.error("[release] releases are cut from main.");
  process.exit(1);
}

const kind = explicitVersion ? "explicit" : (forced ?? proposeBump(changelog));
const nextVersion = explicitVersion ?? bumpVersion(pkg.version, kind);
if (explicitVersion) proposeBump(changelog); // still refuse an empty Unreleased
const unreleased = unreleasedRelease(changelog);
const entryCount = unreleased.sections.reduce((sum, section) => sum + section.items.length, 0);

console.log(`[release] current version ${pkg.version}`);
console.log(`[release] Unreleased holds ${entryCount} entr${entryCount === 1 ? "y" : "ies"} in: ${unreleased.sections.map((s) => s.title).join(", ")}`);
console.log(`[release] proposed ${kind} bump to ${nextVersion}${forced ? " (forced)" : ""}`);
console.log(`[release] support page on first launch: ${supportFlag ? "yes" : "no"} (pass --support to enable)`);

if (dryRun) {
  console.log("[release] dry run, nothing written.");
  process.exit(0);
}

if (!yes) {
  const rl = createInterface({ input: stdin, output: stdout });
  const answer = (await rl.question(`[release] cut v${nextVersion} now? [y/N] `)).trim().toLowerCase();
  rl.close();
  if (!answer.startsWith("y")) {
    console.log("[release] cancelled.");
    process.exit(0);
  }
}

const date = new Date().toISOString().slice(0, 10);
writeFileSync(changelogPath, cutRelease(changelog, { version: nextVersion, date, support: supportFlag }));
pkg.version = nextVersion;
desktopPkg.version = nextVersion;
writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
writeFileSync(desktopPackagePath, `${JSON.stringify(desktopPkg, null, 2)}\n`);

git("add", "CHANGELOG.md", "package.json", "desktop/package.json");
git("commit", "-m", `chore: release v${nextVersion}`);
git("tag", "-a", `v${nextVersion}`, "-m", `Reeve ${nextVersion}`);
console.log(`[release] committed and tagged v${nextVersion}.`);
console.log("[release] push with: git push origin main --follow-tags");

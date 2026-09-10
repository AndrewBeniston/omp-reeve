#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { validateStagedDesktop } from "./desktop-stage-contract.mjs";
import { findMissingBuildPrerequisites, readDesktopTargetArgs } from "./desktop-targets.mjs";
import { repairSpawnHelperModes } from "./pty-package.mjs";

const root = join(import.meta.dir, "..");
const server = join(root, "desktop", "server");

function run(command, args, failureMessage) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${failureMessage} (${result.status ?? "no status"})`);
}

try {
  const { plan } = readDesktopTargetArgs(process.argv.slice(2));
  const missing = findMissingBuildPrerequisites(plan);
  if (missing.length > 0) {
    throw new Error(`This machine is not ready to build ${plan.id}:\n  - ${missing.join("\n  - ")}`);
  }
  run(process.execPath, ["scripts/sync-version.mjs"], "Desktop version synchronization failed");
  run(
    process.execPath,
    ["scripts/stage-desktop.mjs", "--target", plan.id],
    "Desktop staging failed",
  );
  const rootPackage = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  validateStagedDesktop({ packageVersion: rootPackage.version, plan, server });
  // node-pty's helper must be executable before it is packaged. bun's install
  // does not preserve the bit, and a package built without it spawns nothing.
  const repaired = repairSpawnHelperModes(join(root, "desktop", "node_modules", "node-pty"));
  for (const helper of repaired) {
    console.log(`[build-desktop] restored the execute bit on ${helper}`);
  }
  run(
    process.execPath,
    // --publish never: the workflow uploads assets in its own release job. Without
    // this flag electron-builder sees the git tag, tries to upload itself, and
    // fails because the build step has no GH_TOKEN. latest-*.yml is still written.
    ["x", "--bun", "electron-builder", ...plan.builderArgs, "--publish", "never"],
    "Desktop packaging failed",
  );
} catch (error) {
  console.error(`[build-desktop] ${error.message}`);
  process.exit(1);
}

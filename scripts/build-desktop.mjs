#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { validateStagedDesktop } from "./desktop-stage-contract.mjs";
import { readDesktopTargetArgs } from "./desktop-targets.mjs";

const root = join(import.meta.dir, "..");
const server = join(root, "desktop", "server");

function run(command, args, failureMessage) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${failureMessage} (${result.status ?? "no status"})`);
}

try {
  const { plan } = readDesktopTargetArgs(process.argv.slice(2));
  run(process.execPath, ["scripts/sync-version.mjs"], "Desktop version synchronization failed");
  run(
    process.execPath,
    ["scripts/stage-desktop.mjs", "--target", plan.id],
    "Desktop staging failed",
  );
  const rootPackage = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  validateStagedDesktop({ packageVersion: rootPackage.version, plan, server });
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

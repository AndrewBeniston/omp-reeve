#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { validateStagedDesktop } from "./desktop-stage-contract.mjs";
import { bunRuntimeName, readDesktopTargetArgs } from "./desktop-targets.mjs";

const root = join(import.meta.dir, "..");
const server = join(root, "desktop", "server");

function run(command, args, failureMessage) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${failureMessage} (${result.status ?? "no status"})`);
}

// The Next build takes minutes. Both of these are one command to fix, so name
// them before that wait instead of after it. electron-builder reads
// desktop/package.json, which the root install does not cover: it is not a
// workspace member.
function requireBuildPrerequisites(plan) {
  const missing = [];
  if (!existsSync(join(root, "desktop", "node_modules"))) {
    missing.push("desktop/node_modules is missing. Run: cd desktop && bun install --frozen-lockfile");
  }
  for (const triple of plan.bunTriples) {
    const runtime = join(root, "desktop", "resources", bunRuntimeName(triple));
    if (!existsSync(runtime)) {
      missing.push(`desktop/resources/${bunRuntimeName(triple)} is missing. Run: bun run desktop:fetch-bun`);
    }
  }
  if (missing.length > 0) {
    throw new Error(`This machine is not ready to build ${plan.id}:\n  - ${missing.join("\n  - ")}`);
  }
}

try {
  const { plan } = readDesktopTargetArgs(process.argv.slice(2));
  requireBuildPrerequisites(plan);
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

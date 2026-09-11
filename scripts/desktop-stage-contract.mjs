import { existsSync, readFileSync, renameSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { bunRuntimeName } from "./desktop-targets.mjs";

export const DESKTOP_STAGE_MANIFEST = ".omp-desktop-stage.json";

export const PERSONAL_BUILD_PATH_OVERRIDE = "REEVE_ALLOW_PERSONAL_BUILD_PATH";

// A path becomes a list of segments. A drive letter is a segment of its own.
function pathSegments(value, platform) {
  const parts = String(value).replace(/\\/g, "/").split("/").filter(Boolean);
  return platform === "win32" ? parts.map((part) => part.toLowerCase()) : parts;
}

// True when every segment of the shorter list opens the longer one. This is a
// segment test, not a string prefix, so /home/alexander-build sits outside
// /home/alex.
function contains(outer, inner) {
  if (outer.length === 0 || inner.length <= outer.length) return false;
  return outer.every((segment, index) => segment === inner[index]);
}

// The usual parents of a home directory. A build root two levels or more below
// one of these sits inside somebody's home.
const HOME_PARENTS = new Set(["users", "home"]);

function insideAHomeParent(segments) {
  const start = /^[a-z]:$/i.test(segments[0] ?? "") ? 1 : 0;
  const parent = segments[start];
  if (parent === undefined) return false;
  if (!HOME_PARENTS.has(parent.toLowerCase())) return false;
  // segments[start + 1] names the person. A build root needs a segment below it.
  return segments.length >= start + 3;
}

/**
 * Reports why a build root must not be staged, or null when it is acceptable.
 *
 * Next writes the absolute build directory into the server bundle. A build made
 * inside a home directory therefore ships the name of the person who made it,
 * and this repository is public. See issue 6.
 */
export function describePersonalBuildPath({
  env = process.env,
  home = homedir(),
  platform = process.platform,
  root,
} = {}) {
  if (env?.[PERSONAL_BUILD_PATH_OVERRIDE]) return null;
  const segments = pathSegments(root, platform);
  const personal =
    insideAHomeParent(segments) || contains(pathSegments(home, platform), segments);
  if (!personal) return null;
  const neutral = platform === "win32" ? "C:\\reeve\\build" : "/tmp/reeve/build";
  return [
    `This build root sits inside a home directory: ${root}`,
    "Next writes the build directory into the server bundle, and this repository is public.",
    `Build from a neutral path instead, such as ${neutral}.`,
    `Set ${PERSONAL_BUILD_PATH_OVERRIDE}=1 to stage anyway.`,
  ].join(" ");
}

function requireFile(path, label) {
  if (!existsSync(path) || !statSync(path).isFile()) {
    throw new Error(`Desktop stage is missing ${label}: ${path}`);
  }
}

function requireDirectory(path, label) {
  if (!existsSync(path) || !statSync(path).isDirectory()) {
    throw new Error(`Desktop stage is missing ${label}: ${path}`);
  }
}

export function createStageManifest({ buildId, packageVersion, plan }) {
  return {
    schemaVersion: 1,
    packageVersion,
    buildId,
    target: plan.id,
  };
}

export function validateStageFiles({ plan, server }) {
  const buildIdPath = join(server, ".next", "BUILD_ID");
  requireFile(buildIdPath, "the Next build identifier");
  const buildId = readFileSync(buildIdPath, "utf8").trim();
  if (!buildId) throw new Error(`Desktop stage has an empty build identifier: ${buildIdPath}`);

  requireFile(join(server, "node_modules", "next", "dist", "bin", "next"), "the Next server entry");
  for (const entry of plan.nativePackages) {
    requireDirectory(join(server, "node_modules", ...entry.name.split("/")), entry.name);
  }
  for (const triple of plan.bunTriples) {
    requireFile(join(server, bunRuntimeName(triple)), `the ${triple} Bun runtime`);
  }
  return buildId;
}

export function validateStagedDesktop({ packageVersion, plan, server }) {
  const manifestPath = join(server, DESKTOP_STAGE_MANIFEST);
  if (!existsSync(manifestPath)) {
    throw new Error(`Desktop stage manifest is missing: ${manifestPath}`);
  }

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(`Desktop stage manifest is invalid: ${error.message}`);
  }

  const buildId = validateStageFiles({ plan, server });
  const expected = createStageManifest({ buildId, packageVersion, plan });
  if (JSON.stringify(manifest) !== JSON.stringify(expected)) {
    throw new Error(
      `Desktop stage manifest does not match ${packageVersion}, ${buildId}, and ${plan.id}.`,
    );
  }
  return manifest;
}

export function recoverInterruptedStage({ previous, server }) {
  if (existsSync(previous) && !existsSync(server)) {
    renameSync(previous, server);
    return;
  }
  rmSync(previous, { recursive: true, force: true });
}

export function publishStagedDesktop({ previous, server, staging }) {
  recoverInterruptedStage({ previous, server });
  const hadPrevious = existsSync(server);
  if (hadPrevious) renameSync(server, previous);
  try {
    renameSync(staging, server);
  } catch (error) {
    if (hadPrevious && existsSync(previous) && !existsSync(server)) {
      renameSync(previous, server);
    }
    throw error;
  }
  rmSync(previous, { recursive: true, force: true });
}

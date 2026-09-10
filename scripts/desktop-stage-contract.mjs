import { existsSync, readFileSync, renameSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

import { bunRuntimeName } from "./desktop-targets.mjs";

export const DESKTOP_STAGE_MANIFEST = ".omp-desktop-stage.json";

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

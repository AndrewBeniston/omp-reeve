import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  DESKTOP_STAGE_MANIFEST,
  createStageManifest,
  publishStagedDesktop,
  recoverInterruptedStage,
  validateStagedDesktop,
} from "./desktop-stage-contract.mjs";
import { resolveDesktopPlan } from "./desktop-targets.mjs";

async function writeStage(server, plan, { omitNative } = {}) {
  await mkdir(join(server, ".next"), { recursive: true });
  await mkdir(join(server, "node_modules", "next", "dist", "bin"), { recursive: true });
  await writeFile(join(server, ".next", "BUILD_ID"), "build-one");
  await writeFile(join(server, "node_modules", "next", "dist", "bin", "next"), "next");
  for (const entry of plan.nativePackages) {
    if (entry.name !== omitNative) {
      await mkdir(join(server, "node_modules", ...entry.name.split("/")), { recursive: true });
    }
  }
  for (const triple of plan.bunTriples) {
    await writeFile(join(server, `bun-${triple}`), "bun");
  }
  const manifest = createStageManifest({ buildId: "build-one", packageVersion: "0.4.2", plan });
  await writeFile(join(server, DESKTOP_STAGE_MANIFEST), `${JSON.stringify(manifest)}\n`);
  return manifest;
}

test("a complete desktop stage validates against one target plan", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "omp-desktop-stage-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const server = join(root, "server");
  const plan = resolveDesktopPlan({ arch: "arm64", platform: "darwin", universal: false });
  const manifest = await writeStage(server, plan);

  assert.deepEqual(
    validateStagedDesktop({ packageVersion: "0.4.2", plan, server }),
    manifest,
  );
});

test("an incomplete native package blocks desktop packaging", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "omp-desktop-stage-missing-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const plan = resolveDesktopPlan({ arch: "arm64", platform: "darwin", universal: false });
  const missing = plan.nativePackages[0].name;
  await writeStage(root, plan, { omitNative: missing });

  assert.throws(
    () => validateStagedDesktop({ packageVersion: "0.4.2", plan, server: root }),
    new RegExp(missing.replaceAll("/", "\\/")),
  );
});

test("stage publication replaces the old stage and removes transaction state", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "omp-desktop-publish-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const server = join(root, "server");
  const staging = join(root, "server.staging");
  const previous = join(root, "server.previous");
  await mkdir(server);
  await mkdir(staging);
  await writeFile(join(server, "state"), "old");
  await writeFile(join(staging, "state"), "new");

  publishStagedDesktop({ previous, server, staging });

  assert.equal(await readFile(join(server, "state"), "utf8"), "new");
  await assert.rejects(readFile(join(previous, "state"), "utf8"), { code: "ENOENT" });
});

test("stage publication restores the old stage when the new stage is missing", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "omp-desktop-rollback-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const server = join(root, "server");
  const staging = join(root, "server.staging");
  const previous = join(root, "server.previous");
  await mkdir(server);
  await writeFile(join(server, "state"), "old");

  assert.throws(() => publishStagedDesktop({ previous, server, staging }));
  assert.equal(await readFile(join(server, "state"), "utf8"), "old");
});

test("stage recovery restores an interrupted previous stage", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "omp-desktop-recovery-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const server = join(root, "server");
  const previous = join(root, "server.previous");
  await mkdir(previous);
  await writeFile(join(previous, "state"), "old");

  recoverInterruptedStage({ previous, server });

  assert.equal(await readFile(join(server, "state"), "utf8"), "old");
});

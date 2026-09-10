import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { repairSpawnHelperModes, spawnHelperDirectories } from "./pty-package.mjs";

function packageWithHelper(mode) {
  const root = mkdtempSync(join(tmpdir(), "reeve-pty-package-"));
  const directory = join(root, "prebuilds", "darwin-arm64");
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "pty.node"), "");
  const helper = join(directory, "spawn-helper");
  writeFileSync(helper, "");
  chmodSync(helper, mode);
  return { root, helper };
}

test("a spawn-helper that lost its execute bit is repaired", { skip: process.platform === "win32" }, () => {
  const { root, helper } = packageWithHelper(0o644);

  const repaired = repairSpawnHelperModes(root);

  assert.deepEqual(repaired, [helper]);
  assert.ok((statSync(helper).mode & 0o111) !== 0, "the helper is still not executable");
  rmSync(root, { recursive: true, force: true });
});

test("an already executable helper is left alone", { skip: process.platform === "win32" }, () => {
  const { root, helper } = packageWithHelper(0o755);
  const before = statSync(helper).mode;

  assert.deepEqual(repairSpawnHelperModes(root), []);
  assert.equal(statSync(helper).mode, before);
  rmSync(root, { recursive: true, force: true });
});

test("both the prebuilt and the locally built helper are found", () => {
  const root = mkdtempSync(join(tmpdir(), "reeve-pty-package-"));
  mkdirSync(join(root, "prebuilds", "linux-x64"), { recursive: true });
  mkdirSync(join(root, "build", "Release"), { recursive: true });

  assert.deepEqual(spawnHelperDirectories(root), [
    join(root, "prebuilds", "linux-x64"),
    join(root, "build", "Release"),
  ]);
  rmSync(root, { recursive: true, force: true });
});

test("a package with no helper at all is not an error", () => {
  const root = mkdtempSync(join(tmpdir(), "reeve-pty-package-"));
  assert.deepEqual(repairSpawnHelperModes(root), []);
  rmSync(root, { recursive: true, force: true });
});

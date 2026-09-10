import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  findMissingBuildPrerequisites,
  nativeInstallFlags, resolveDesktopPlan, resolvePackagedApplication } from "./desktop-targets.mjs";

test("the macOS ARM plan owns every build target", () => {
  const plan = resolveDesktopPlan({ arch: "arm64", platform: "darwin", universal: false });

  assert.equal(plan.id, "darwin-arm64");
  assert.deepEqual(plan.bunTriples, ["darwin-aarch64"]);
  assert.deepEqual(plan.builderArgs, ["--mac", "dmg", "zip", "--arm64"]);
  assert.deepEqual(plan.nativePackages.map((entry) => entry.name), [
    "@next/swc-darwin-arm64",
    "@oh-my-pi/pi-natives-darwin-arm64",
    "@oh-my-pi/omp-stats",
  ]);
});

test("the universal macOS plan owns both architectures", () => {
  const plan = resolveDesktopPlan({ arch: "arm64", platform: "darwin", universal: true });

  assert.equal(plan.id, "darwin-universal");
  assert.deepEqual(plan.bunTriples, ["darwin-aarch64", "darwin-x64"]);
  assert.deepEqual(plan.builderArgs, ["--mac", "dmg", "zip", "--universal"]);
  assert.deepEqual(plan.nativePackages.map((entry) => entry.name), [
    "@next/swc-darwin-arm64",
    "@oh-my-pi/pi-natives-darwin-arm64",
    "@next/swc-darwin-x64",
    "@oh-my-pi/pi-natives-darwin-x64",
    "@oh-my-pi/omp-stats",
  ]);
});

test("the macOS Intel plan owns its native packages", () => {
  const plan = resolveDesktopPlan({ arch: "x64", platform: "darwin", universal: false });

  assert.equal(plan.id, "darwin-x64");
  assert.equal(plan.bunBinary, "bun-darwin-x64");
  assert.deepEqual(plan.bunTriples, ["darwin-x64"]);
  assert.deepEqual(plan.nativePackages.map((entry) => entry.name), [
    "@next/swc-darwin-x64",
    "@oh-my-pi/pi-natives-darwin-x64",
    "@oh-my-pi/omp-stats",
  ]);
});

test("the Windows plan owns its x64 packages", () => {
  const plan = resolveDesktopPlan({ arch: "x64", platform: "win32", universal: false });

  assert.equal(plan.id, "win32-x64");
  assert.deepEqual(plan.bunTriples, ["windows-x64"]);
  assert.deepEqual(plan.builderArgs, ["--win", "nsis", "--x64"]);
  assert.deepEqual(plan.nativePackages.map((entry) => entry.name), [
    "@next/swc-win32-x64-msvc",
    "@oh-my-pi/pi-natives-win32-x64",
    "@oh-my-pi/omp-stats",
  ]);
});

test("linux x64 resolves to the AppImage plan", () => {
  const plan = resolveDesktopPlan({ arch: "x64", platform: "linux", universal: false });
  assert.equal(plan.id, "linux-x64");
  assert.deepEqual(plan.bunTriples, ["linux-x64"]);
  assert.deepEqual(plan.builderArgs, ["--linux", "AppImage", "--x64"]);
  assert.equal(
    resolvePackagedApplication(plan, {
      exists: (path) => path === "/repo/desktop/dist/linux-unpacked/reeve",
      root: "/repo",
    }),
    "/repo/desktop/dist/linux-unpacked/reeve",
  );
});

test("unsupported desktop targets fail before staging", () => {
  assert.throws(
    () => resolveDesktopPlan({ arch: "arm64", platform: "linux", universal: false }),
    /Unsupported desktop target/,
  );
});

test("the target plan resolves its packaged application path", () => {
  const plan = resolveDesktopPlan({ target: "darwin-universal" });
  const expected = "/repo/desktop/dist/mac-universal/Reeve.app";

  assert.equal(
    resolvePackagedApplication(plan, { exists: (path) => path === expected, root: "/repo" }),
    expected,
  );
});

test("native installs name their os and cpu so Bun does not skip a cross-arch package", () => {
  const universal = resolveDesktopPlan({ target: "darwin-universal" });
  assert.deepEqual(nativeInstallFlags({ name: "@next/swc-darwin-x64" }, universal), ["--os", "darwin", "--cpu", "x64"]);
  assert.deepEqual(nativeInstallFlags({ name: "@oh-my-pi/pi-natives-darwin-arm64" }, universal), ["--os", "darwin", "--cpu", "arm64"]);
  assert.deepEqual(nativeInstallFlags({ name: "@oh-my-pi/omp-stats" }, universal), ["--os", "darwin"]);
  assert.deepEqual(nativeInstallFlags({ name: "@next/swc-linux-x64-gnu" }, resolveDesktopPlan({ target: "linux-x64" })), ["--os", "linux", "--cpu", "x64"]);
  assert.deepEqual(nativeInstallFlags({ name: "@next/swc-win32-x64-msvc" }, resolveDesktopPlan({ target: "win32-x64" })), ["--os", "win32", "--cpu", "x64"]);
});

test("a ready machine reports no missing desktop build prerequisite", () => {
  const plan = resolveDesktopPlan({ target: "win32-x64" });

  assert.deepEqual(findMissingBuildPrerequisites(plan, { exists: () => true }), []);
});

// electron-builder resolves desktop/package.json dependencies, so an empty
// desktop/node_modules must fail here and not minutes later inside packaging.
test("an empty desktop node_modules is still a missing prerequisite", () => {
  const plan = resolveDesktopPlan({ target: "win32-x64" });

  const missing = findMissingBuildPrerequisites(plan, {
    exists: (path) => !path.includes("node_modules"),
  });

  // Every dependency the desktop package declares must be reported, so this
  // count follows that list rather than being written out here. node-pty
  // joined it with the Terminal tab.
  const declared = Object.keys(
    JSON.parse(readFileSync(join(import.meta.dir, "..", "desktop", "package.json"), "utf8")).dependencies,
  );
  assert.equal(missing.length, declared.length);
  for (const name of declared) {
    assert.ok(
      missing.some((entry) => entry.includes(`desktop/node_modules/${name} is missing`)),
      `${name} was not reported as missing`,
    );
  }
  assert.match(missing[0], /cd desktop && bun install --frozen-lockfile/);
});

// fetch-bun downloads the host target by default, so a cross-target build must
// be told which target to fetch.
test("a missing Bun runtime names the target to fetch", () => {
  const plan = resolveDesktopPlan({ target: "win32-x64" });

  const missing = findMissingBuildPrerequisites(plan, {
    exists: (path) => !path.includes("bun-windows-x64.exe"),
  });

  assert.deepEqual(missing, [
    "desktop/resources/bun-windows-x64.exe is missing. Run: bun run desktop:fetch-bun --target win32-x64",
  ]);
});

test("the universal macOS plan reports every Bun runtime it is missing", () => {
  const plan = resolveDesktopPlan({ target: "darwin-universal" });

  const missing = findMissingBuildPrerequisites(plan, {
    exists: (path) => !path.includes("desktop") || !path.includes("resources"),
  });

  assert.equal(missing.length, plan.bunTriples.length);
});

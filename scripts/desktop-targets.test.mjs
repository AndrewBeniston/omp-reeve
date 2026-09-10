import assert from "node:assert/strict";
import test from "node:test";

import {
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

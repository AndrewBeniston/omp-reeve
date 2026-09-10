import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = join(import.meta.dir, "..");

test("desktop commands package the Electron shell with the staged Bun server", () => {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

  assert.equal(pkg.name, "omp-reeve");
  assert.equal(pkg.private, true);
  assert.equal(pkg.repository.url, "git+https://github.com/AndrewBeniston/omp-reeve.git");
  assert.deepEqual(pkg.bin, { reeve: "bin/omp-web.js" });
  assert.equal(pkg.build.appId, "com.andrewbeniston.reeve");
  assert.equal(pkg.build.productName, "Reeve");
  assert.equal(pkg.main, undefined);
  assert.equal(pkg.devDependencies.electron, "44.1.1");
  assert.equal(pkg.devDependencies["electron-builder"], "26.15.3");
  assert.equal(pkg.scripts["desktop:dev"], "bun scripts/dev-desktop.mjs");
  assert.equal(pkg.scripts["desktop:verify-package"], "bun scripts/verify-desktop-package.mjs");
  assert.equal(
    pkg.scripts["desktop:build"],
    "bun scripts/build-desktop.mjs",
  );
  assert.equal(pkg.build.directories.app, "desktop");
  assert.ok(pkg.build.files.includes("node_modules/**/*"), "electron-updater ships from desktop/node_modules");
  assert.ok(pkg.build.files.includes("update-controller.cjs"));
  assert.ok(pkg.build.files.includes("targets.json"));
  assert.equal(pkg.build.mac.notarize, true);
  assert.equal(pkg.build.mac.hardenedRuntime, true);
  assert.equal(pkg.build.linux.executableName, "reeve");
  assert.deepEqual(pkg.build.publish, { provider: "github", owner: "AndrewBeniston", repo: "omp-reeve" });
  assert.equal(pkg.build.mac.target, undefined);
  assert.equal(pkg.build.win.target, undefined);
  assert.deepEqual(pkg.build.extraResources, [
    { from: "desktop/server/.next", to: "server/.next", filter: ["**/*"] },
    { from: "desktop/server/node_modules", to: "server/node_modules", filter: ["**/*"] },
    {
      from: "desktop/server",
      to: "server",
      filter: ["bin/**/*", "public/**/*", "next.config.ts", "package.json", "CHANGELOG.md", "bun.lock", "bun-*"],
    },
  ]);

  const desktopPkg = JSON.parse(readFileSync(join(root, "desktop", "package.json"), "utf8"));
  assert.equal(desktopPkg.name, "reeve");
  assert.equal(desktopPkg.version, pkg.version);
  assert.equal(desktopPkg.main, "main.cjs");
  // electron-updater is the only runtime dependency the Electron shell may carry.
  // The OMP SDK must never enter this process (AGENTS.md, desktop shell).
  assert.deepEqual(Object.keys(desktopPkg.dependencies), ["electron-updater"]);
  assert.match(desktopPkg.dependencies["electron-updater"], /^6/);

  const developmentLauncher = readFileSync(join(root, "scripts", "dev-desktop.mjs"), "utf8");
  assert.match(developmentLauncher, /\.bin", "electron"\), \["desktop"\]/);

  const build = readFileSync(join(root, "scripts", "build-desktop.mjs"), "utf8");
  assert.match(build, /validateStagedDesktop/);
});

test("the repository contains no previous desktop framework artifact", () => {
  const forbidden = "tau" + "ri";
  const forbiddenContent = new RegExp(`\\b${forbidden}\\b|src-${forbidden}|@${forbidden}|${forbidden.toUpperCase()}_`, "i");
  const paths = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: root, encoding: "utf8" },
  ).split("\0").filter(Boolean);

  const matches = [];
  for (const path of paths) {
    if (!existsSync(join(root, path))) continue;
    if (path.toLowerCase().includes(forbidden)) {
      matches.push(path);
      continue;
    }
    const content = readFileSync(join(root, path));
    if (content.includes(0)) continue;
    if (forbiddenContent.test(content.toString("utf8"))) matches.push(path);
  }

  assert.deepEqual(matches, []);
});

test("desktop releases sync versions and require signed packages", () => {
  const workflow = readFileSync(
    join(root, ".github", "workflows", "publish-desktop-electron.yml"),
    "utf8",
  );

  assert.match(workflow, /bun run desktop:sync-version/);
  assert.match(workflow, /CSC_LINK:.*MACOS_CSC_LINK/);
  assert.doesNotMatch(workflow, /WIN_CSC_LINK:/);
  assert.match(workflow, /target: darwin-arm64/);
  assert.match(workflow, /target: darwin-x64/);
  assert.doesNotMatch(workflow, /target: darwin-universal/, "the universal merge walks 800 MB single-threaded; ship two packages");
  assert.match(workflow, /working-directory: desktop/, "the Electron shell installs its own dependencies on the runner");
  assert.match(workflow, /latest\*\.yml/);
  assert.match(workflow, /codesign --verify --deep --strict/);
  assert.match(workflow, /APPLE_API_KEY/);
  assert.match(workflow, /spctl --assess/);
  assert.match(workflow, /desktop:artifact-path/);
  assert.doesNotMatch(workflow, /desktop\/dist\/mac-universal/);
  // Manual only. macOS runners bill at 10x; a tag push must never start this.
  assert.match(workflow, /^on:\s*\n\s+workflow_dispatch:/m, "the publish workflow starts only by hand");
  assert.doesNotMatch(workflow, /^\s+push:\s*\n\s+tags:/m, "a tag push must not start a paid build");
  assert.match(workflow, /RELEASE_TAG: \$\{\{ inputs\.tag \}\}/);
  assert.match(workflow, /ref: \$\{\{ inputs\.tag \}\}/);
  const buildScript = readFileSync(join(root, "scripts", "build-desktop.mjs"), "utf8");
  assert.match(buildScript, /"--publish", "never"/, "the release job uploads; electron-builder must not");
  assert.match(workflow, /bun test/);
  assert.match(workflow, /bun run typecheck/);
  assert.match(workflow, /bun run lint/);
  assert.match(workflow, /bun run desktop:verify-package/);
  assert.match(workflow, /uses: actions\/upload-artifact@v4/);
  assert.match(workflow, /uses: actions\/download-artifact@v4/);
  assert.match(workflow, /publish-release:[\s\S]*needs: publish-desktop/);
  assert.equal((workflow.match(/uses: softprops\/action-gh-release@v2/g) ?? []).length, 1);
});

test("package verification owns and terminates its complete process tree", () => {
  const verifier = readFileSync(join(root, "scripts", "verify-desktop-package.mjs"), "utf8");

  assert.match(verifier, /if \(await portIsOpen\(desktopOrigin\)\)/);
  assert.match(verifier, /detached: process\.platform !== "win32"/);
  assert.match(verifier, /process\.kill\(-applicationProcess\.pid, signal\)/);
  assert.doesNotMatch(
    verifier,
    /async function terminateApplication[^]*?\{\s*if \(applicationProcess\.exitCode !== null \|\| applicationProcess\.signalCode !== null\) return;/,
  );
});

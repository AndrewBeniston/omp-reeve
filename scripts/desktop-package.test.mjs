import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { namesAPerson } from "./build-path.mjs";

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
  // One pattern, so a new shell module is packaged without an edit here. The
  // require graph is checked below.
  assert.ok(pkg.build.files.includes("*.cjs"));
  assert.ok(pkg.build.files.includes("targets.json"));
  assert.equal(pkg.build.mac.notarize, true);
  assert.equal(pkg.build.mac.hardenedRuntime, true);
  assert.equal(pkg.build.linux.executableName, "reeve");
  // Each platform publishes to its own feed now, so no shared one may return.
  // scripts/update-feed.test.mjs holds the per-platform rule. ADR-0013.
  assert.equal(pkg.build.publish, undefined);
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
  // Exactly two runtime dependencies may enter the Electron shell, and this
  // list is the gate: electron-updater, which owns self-update, and node-pty,
  // which owns the Terminal tab's shells because only the desktop process may
  // spawn one. The OMP SDK must never enter this process (AGENTS.md, desktop
  // shell). Adding a third is a decision, not a convenience.
  assert.deepEqual(Object.keys(desktopPkg.dependencies), ["electron-updater", "node-pty"]);
  assert.match(desktopPkg.dependencies["electron-updater"], /^6/);
  assert.match(desktopPkg.dependencies["node-pty"], /^\^?1\./);

  // A native binary cannot be executed or loaded from inside an asar archive,
  // so node-pty ships unpacked beside it.
  assert.ok(
    pkg.build.asarUnpack?.some((pattern) => pattern.includes("node-pty")),
    "node-pty must be unpacked from the asar or every Terminal fails at runtime.",
  );

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

test("package verification refuses a personal build path", () => {
  // Next writes the build directory into the server bundle. A package built
  // from a home directory carries the name of the person who built it, and
  // this repository is public. Issue 6.
  const verifier = readFileSync(join(root, "scripts", "verify-desktop-package.mjs"), "utf8");
  assert.match(verifier, /verifyNoPersonalPaths\(resources\)/);
  assert.match(verifier, /namesAPerson\(contents\)/);

  // One rule lives in build-path.mjs. It reads the build root and the
  // packaged output. Here are the three shapes it must catch, and the three
  // it must not. Reeve serves a route at /api/home, and that route is not a
  // person. A neutral build path is allowed.
  const caught = [
    String.raw`const a = "/Users/alex/build/next";`,
    String.raw`const a = "/home/builder/reeve/.next";`,
    String.raw`const a = "C:\\Users\\alex\\reeve";`,
  ];
  for (const contents of caught) assert.equal(namesAPerson(contents), true, contents);

  const allowed = [
    String.raw`{"/api/home/route":"/api/home"}`,
    String.raw`resolvedPagePath:"C:\\reeve\\build\\app\\api\\home\\route.ts"`,
    String.raw`const c = "/tmp/reeve/build"; const d = "C:/reeve/build";`,
  ];
  for (const contents of allowed) assert.equal(namesAPerson(contents), false, contents);
});

test("every module the desktop shell requires is packaged", () => {
  // The packaged list was written by hand. Three files that main.cjs requires
  // were missing from it, so the installed application could not start at all.
  // Walk the require graph instead of trusting the list.
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const patterns = pkg.build.files;
  const packaged = (name) =>
    patterns.some((pattern) => pattern === name || (pattern === "*.cjs" && name.endsWith(".cjs")));

  const seen = new Set();
  const queue = ["main.cjs", "preload.cjs"];
  while (queue.length > 0) {
    const file = queue.pop();
    if (seen.has(file) || !file.endsWith(".cjs")) continue;
    seen.add(file);
    assert.ok(packaged(file), `${file} is required by the desktop shell and is not packaged`);
    const source = readFileSync(join(root, "desktop", file), "utf8");
    for (const match of source.matchAll(/require\("\.\/([\w.-]+)"\)/g)) {
      const name = match[1];
      queue.push(name.includes(".") ? name : `${name}.cjs`);
    }
  }

  // The three that were missing. A future move must not drop them again.
  for (const file of ["terminal-host.cjs", "browser-views.cjs", "agent-browser-access.cjs"]) {
    assert.ok(seen.has(file), file);
  }
});

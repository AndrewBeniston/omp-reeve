#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import {
  DESKTOP_STAGE_MANIFEST,
  createStageManifest,
  publishStagedDesktop,
  recoverInterruptedStage,
  validateStageFiles,
  validateStagedDesktop,
} from "./desktop-stage-contract.mjs";
import { bunRuntimeName, nativeInstallFlags, readDesktopTargetArgs } from "./desktop-targets.mjs";

const root = join(import.meta.dir, "..");
const server = join(root, "desktop", "server");
const staging = join(root, "desktop", "server.staging");
const previous = join(root, "desktop", "server.previous");

function run(command, args, options, failureMessage) {
  const result = spawnSync(command, args, options);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${failureMessage} (${result.status ?? "no status"})`);
}

function packagePath(base, name) {
  return join(base, "node_modules", ...name.split("/"));
}

function readRequiredVersion(entry) {
  const hostPackagePath = join(root, "node_modules", ...entry.versionHost.split("/"), "package.json");
  let hostPackage;
  try {
    hostPackage = JSON.parse(readFileSync(hostPackagePath, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read the version source for ${entry.name}: ${error.message}`);
  }
  const version = hostPackage.optionalDependencies?.[entry.name] ?? hostPackage.version;
  if (typeof version !== "string" || version.length === 0) {
    throw new Error(`No version is available for required package ${entry.name}.`);
  }
  return version;
}

function installRequiredPackage(entry, plan) {
  const source = packagePath(root, entry.name);
  const destination = packagePath(staging, entry.name);
  const destinationPackage = join(destination, "package.json");
  if (existsSync(destinationPackage)) {
    // The staging `bun install --production` already placed this package. On
    // Linux Bun may satisfy it with a symlink back into the root tree, and
    // copying root over it would copy a file onto itself (EINVAL). Resolve the
    // link into real files so the packaged app carries no symlink.
    const real = realpathSync(destination);
    if (real !== destination) {
      rmSync(destination, { recursive: true, force: true });
      cpSync(real, destination, { recursive: true, dereference: true });
    }
  } else if (existsSync(source)) {
    cpSync(source, destination, { recursive: true, dereference: true });
  } else {
    const version = readRequiredVersion(entry);
    run(
      "bun",
      // --production: without it "bun add" reinstalls every devDependency into
      // the staged tree (197 packages become 1042 and the signing walk hits EMFILE).
      [
        "add",
        `${entry.name}@${version}`,
        "--production",
        "--omit=optional",
        ...nativeInstallFlags(entry, plan),
      ],
      { cwd: staging, stdio: "inherit" },
      `Required package installation failed for ${entry.name}@${version}`,
    );
  }
  if (!existsSync(destination)) {
    throw new Error(`Required package ${entry.name} is unavailable after installation.`);
  }
}

function removeBrokenBinLinks() {
  const binDirectory = join(staging, "node_modules", ".bin");
  if (!existsSync(binDirectory)) return;
  for (const entry of readdirSync(binDirectory)) {
    const link = join(binDirectory, entry);
    try {
      realpathSync(link);
    } catch {
      rmSync(link, { force: true });
    }
  }
}

function buildNextIntoStaging() {
  const tsconfigPath = join(root, "tsconfig.json");
  const tsconfig = readFileSync(tsconfigPath, "utf8");
  try {
    run(
      "bun",
      ["run", "build"],
      {
        cwd: root,
        stdio: "inherit",
        env: { ...process.env, OMP_WEB_DIST_DIR: "desktop/server.staging/.next" },
      },
      "The Next production build failed",
    );
  } finally {
    if (readFileSync(tsconfigPath, "utf8") !== tsconfig) writeFileSync(tsconfigPath, tsconfig);
  }
}

function stageDesktop() {
  const { options, plan } = readDesktopTargetArgs(process.argv.slice(2), ["--skip-build"]);
  const skipBuild = options.has("--skip-build");
  const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

  recoverInterruptedStage({ previous, server });
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });

  for (const entry of ["bin", "public", "next.config.ts", "package.json", "CHANGELOG.md", "bun.lock"]) {
    cpSync(join(root, entry), join(staging, entry), { recursive: true });
  }

  if (skipBuild) {
    const completedBuild = join(server, ".next", "BUILD_ID");
    if (!existsSync(completedBuild)) {
      throw new Error("The previous production build is missing. Run staging without --skip-build.");
    }
    cpSync(join(server, ".next"), join(staging, ".next"), { recursive: true });
  } else {
    buildNextIntoStaging();
  }

  rmSync(join(staging, ".next", "cache"), { recursive: true, force: true });
  rmSync(join(staging, ".next", "dev"), { recursive: true, force: true });

  run(
    "bun",
    ["install", "--production", "--frozen-lockfile", "--omit=optional"],
    { cwd: staging, stdio: "inherit" },
    "The production dependency installation failed",
  );

  for (const name of [
    "lucide-react",
    "chart.js",
    "react-chartjs-2",
    "@tailwindcss",
    "lightningcss",
    ...plan.prunePackages,
  ]) {
    rmSync(packagePath(staging, name), { recursive: true, force: true });
  }
  removeBrokenBinLinks();

  for (const entry of plan.nativePackages) installRequiredPackage(entry, plan);

  const resources = join(root, "desktop", "resources");
  for (const triple of plan.bunTriples) {
    const name = bunRuntimeName(triple);
    const source = join(resources, name);
    if (!existsSync(source)) {
      throw new Error(`Required Bun runtime is missing: ${source}. Run bun run desktop:fetch-bun.`);
    }
    const destination = join(staging, name);
    cpSync(source, destination);
    if (process.platform !== "win32") chmodSync(destination, 0o755);
  }

  const buildId = validateStageFiles({ plan, server: staging });
  const manifest = createStageManifest({ buildId, packageVersion: packageJson.version, plan });
  writeFileSync(join(staging, DESKTOP_STAGE_MANIFEST), `${JSON.stringify(manifest)}\n`);
  validateStagedDesktop({ packageVersion: packageJson.version, plan, server: staging });
  publishStagedDesktop({ previous, server, staging });

  if (process.platform === "win32") {
    console.log(`[stage-desktop] ${plan.id} payload is complete`);
    return;
  }
  const size = spawnSync("du", ["-sh", server], { encoding: "utf8" });
  console.log(`[stage-desktop] ${plan.id} payload is complete (${(size.stdout ?? "").trim()})`);
}

try {
  stageDesktop();
} catch (error) {
  rmSync(staging, { recursive: true, force: true });
  console.error(`[stage-desktop] ${error.message}`);
  process.exit(1);
}

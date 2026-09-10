import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

const TARGETS = JSON.parse(
  readFileSync(new URL("../desktop/targets.json", import.meta.url), "utf8"),
);

export const DESKTOP_TARGET_IDS = Object.freeze(Object.keys(TARGETS));
export const DESKTOP_BUN_TRIPLES = Object.freeze([
  ...new Set(Object.values(TARGETS).flatMap((plan) => plan.bunTriples)),
]);

function targetIdForHost({ arch, platform, universal }) {
  if (platform === "darwin" && universal) return "darwin-universal";
  return Object.values(TARGETS).find(
    (plan) => !plan.universal && plan.platform === platform && plan.arch === arch,
  )?.id;
}

export function resolveDesktopPlan({
  arch = process.arch,
  platform = process.platform,
  target = process.env.OMP_DESKTOP_TARGET,
  universal = false,
} = {}) {
  const id = target || targetIdForHost({ arch, platform, universal });
  const plan = id ? TARGETS[id] : undefined;
  if (!plan) {
    const requested = target || `${platform}-${arch}${universal ? "-universal" : ""}`;
    throw new Error(
      `Unsupported desktop target "${requested}". Expected one of: ${DESKTOP_TARGET_IDS.join(", ")}`,
    );
  }
  return plan;
}

export function readDesktopTargetArgs(args, allowedOptions = []) {
  const remaining = [];
  let target;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--target") {
      target = args[index + 1];
      if (!target) throw new Error("The --target option requires a desktop target.");
      index += 1;
      continue;
    }
    if (allowedOptions.includes(argument)) {
      remaining.push(argument);
      continue;
    }
    throw new Error(`Unknown desktop option "${argument}".`);
  }
  return {
    options: new Set(remaining),
    plan: resolveDesktopPlan({ target }),
  };
}

export function bunRuntimeName(triple) {
  if (!DESKTOP_BUN_TRIPLES.includes(triple)) {
    throw new Error(`Unsupported Bun runtime triple "${triple}".`);
  }
  return `bun-${triple}${triple === "windows-x64" ? ".exe" : ""}`;
}

export function resolvePackagedApplication(
  plan,
  { exists = existsSync, root = repositoryRoot } = {},
) {
  const applicationName =
    plan.platform === "win32" ? "Reeve.exe" : plan.platform === "linux" ? "reeve" : "Reeve.app";
  for (const directory of plan.appOutputDirectories) {
    const candidate = join(root, "desktop", "dist", directory, applicationName);
    if (exists(candidate)) return candidate;
  }
  throw new Error(`No packaged application exists for ${plan.id}.`);
}

const BUN_OS = { darwin: "darwin", linux: "linux", win32: "win32" };

/**
 * Bun skips a package whose os or cpu field does not match the host and still
 * prints "installed". A universal macOS stage on an arm64 runner needs the x64
 * SWC binary, so every native install names its platform and arch explicitly.
 */
export function nativeInstallFlags(entry, plan) {
  const os = BUN_OS[plan.platform];
  const suffix = entry.name.match(/-(arm64|x64)(?:-[a-z]+)?$/)?.[1];
  const cpu = plan.universal ? suffix : plan.arch;
  const flags = [];
  if (os) flags.push("--os", os);
  if (cpu) flags.push("--cpu", cpu);
  return flags;
}

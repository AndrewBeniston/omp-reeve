import { chmodSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Restore the execute bit on node-pty's spawn-helper.
 *
 * On macOS and Linux node-pty does not fork the shell itself. It executes a
 * small helper binary that sets up the pty and then becomes the shell. The
 * helper is shipped inside the package as a prebuilt binary, and an installer
 * that does not preserve file modes leaves it non-executable. bun does not
 * preserve it, and node-pty's own postinstall script is what would normally
 * repair it.
 *
 * The failure this prevents is opaque: the module loads, the binding resolves,
 * and every spawn fails with "posix_spawnp failed". So it is repaired before
 * packaging and asserted afterwards by the package verifier.
 *
 * Returns the paths it changed, so a caller can say what it did.
 */
export function repairSpawnHelperModes(packageRoot) {
  if (process.platform === "win32") return [];

  const repaired = [];
  for (const directory of spawnHelperDirectories(packageRoot)) {
    const helper = join(directory, "spawn-helper");
    if (!existsSync(helper)) continue;
    // 0o111 is the three execute bits. A helper that already carries them is
    // left alone, so a correct package is not rewritten on every build.
    const mode = statSync(helper).mode;
    if ((mode & 0o111) === 0o111) continue;
    chmodSync(helper, mode | 0o755);
    repaired.push(helper);
  }
  return repaired;
}

/** Where a spawn-helper can be: the prebuilds tree, or a locally built one. */
export function spawnHelperDirectories(packageRoot) {
  const directories = [];
  const prebuilds = join(packageRoot, "prebuilds");
  if (existsSync(prebuilds)) {
    for (const entry of readdirSync(prebuilds)) {
      directories.push(join(prebuilds, entry));
    }
  }
  const built = join(packageRoot, "build", "Release");
  if (existsSync(built)) directories.push(built);
  return directories;
}

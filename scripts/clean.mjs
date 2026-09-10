#!/usr/bin/env bun
/**
 * clean.mjs — remove this repository's own build output.
 *
 * Usage:
 *   bun scripts/clean.mjs           remove build output
 *   bun scripts/clean.mjs --dry-run report the size and remove nothing
 *   bun scripts/clean.mjs --deps    also remove both node_modules trees
 *
 * A desktop build leaves about 2.7 GB behind on every target it packages, and
 * nothing removes the previous one. Shared caches are never touched: the Bun
 * cache and the Electron cache serve every repository on the machine, and
 * removing them costs a long download the next time any of them builds.
 */

import { existsSync, rmSync, statSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");

// Build output only. Each entry is reproduced by bun run desktop:build.
const BUILD_OUTPUT = [
  ".next",
  "desktop/dist",
  "desktop/server",
  "desktop/server.staging",
  "desktop/server.previous",
];

// Reinstalled by bun install, so slower to restore than build output.
const DEPENDENCIES = ["node_modules", "desktop/node_modules"];

function directorySize(path) {
  let total = 0;
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) {
      total += directorySize(child);
    } else if (entry.isFile()) {
      total += statSync(child).size;
    }
  }
  return total;
}

function megabytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const targets = args.includes("--deps") ? [...BUILD_OUTPUT, ...DEPENDENCIES] : BUILD_OUTPUT;

let removed = 0;
for (const target of targets) {
  const path = join(root, target);
  if (!existsSync(path)) continue;
  const size = directorySize(path);
  removed += size;
  console.log(`[clean] ${dryRun ? "would remove" : "removing"} ${target} (${megabytes(size)})`);
  if (!dryRun) rmSync(path, { recursive: true, force: true });
}

console.log(
  removed === 0
    ? "[clean] no build output is present"
    : `[clean] ${dryRun ? "would free" : "freed"} ${megabytes(removed)}`,
);


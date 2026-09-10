#!/usr/bin/env bun

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const rootPackagePath = join(root, "package.json");
const desktopPackagePath = join(root, "desktop", "package.json");
const rootPackage = JSON.parse(readFileSync(rootPackagePath, "utf8"));
const desktopPackage = JSON.parse(readFileSync(desktopPackagePath, "utf8"));

if (typeof rootPackage.version !== "string" || rootPackage.version.length === 0) {
  console.error("[sync-version] package.json has no usable version field");
  process.exit(1);
}

if (desktopPackage.version === rootPackage.version) {
  console.log(`[sync-version] desktop package already uses ${rootPackage.version}`);
  process.exit(0);
}

desktopPackage.version = rootPackage.version;
writeFileSync(desktopPackagePath, `${JSON.stringify(desktopPackage, null, 2)}\n`);
console.log(`[sync-version] desktop package now uses ${rootPackage.version}`);

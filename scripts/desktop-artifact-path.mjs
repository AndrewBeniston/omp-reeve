#!/usr/bin/env bun

import { readDesktopTargetArgs, resolvePackagedApplication } from "./desktop-targets.mjs";

try {
  const { plan } = readDesktopTargetArgs(process.argv.slice(2));
  console.log(resolvePackagedApplication(plan));
} catch (error) {
  console.error(`[desktop-artifact-path] ${error.message}`);
  process.exit(1);
}

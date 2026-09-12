#!/usr/bin/env bun

// Builds one Platform feed from the channel file electron-builder writes.
//
// An installed Reeve reads its own feed and nothing else, so one platform can
// ship alone. The feed is small and lives on GitHub Pages. The Packages stay in
// a GitHub Release, so the feed names each one by its full address. See
// ADR-0013.

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { resolveDesktopPlan } from "./desktop-targets.mjs";

const OWNER = "AndrewBeniston";
const REPO = "omp-reeve";

const ABSOLUTE = /^[a-z][a-z0-9+.-]*:\/\//i;
const URL_LINE = /^(\s*-\s*url:\s*)(\S.*?)\s*$/;
const PATH_LINE = /^(path:\s*)(\S.*?)\s*$/;

/** Where a Release keeps its Packages. */
export function releaseAssetBase({ owner = OWNER, repo = REPO, tag }) {
  if (!tag) throw new Error("A release asset base needs a tag.");
  return "https://github.com/" + owner + "/" + repo + "/releases/download/" + tag + "/";
}

/** The channel file electron-updater asks for. The names are its own. */
export function channelFileName({ platform, arch }) {
  if (platform === "darwin") return "latest-mac.yml";
  if (platform === "linux") {
    return arch === "x64" ? "latest-linux.yml" : "latest-linux-" + arch + ".yml";
  }
  return "latest.yml";
}

/** One directory per platform. Both macOS Packages share one channel file. */
export function feedDirectoryName({ platform }) {
  return platform;
}

/**
 * Names every Package in the feed by its full address.
 *
 * electron-updater resolves a relative name against the feed, which is Pages,
 * and a full address against itself. Verified against the shipped resolver.
 */
export function absolutiseFeed(text, base) {
  let found = 0;
  const lines = text.split("\n").map((line) => {
    const match = URL_LINE.exec(line) ?? PATH_LINE.exec(line);
    if (!match) return line;
    found += 1;
    const [, prefix, value] = match;
    return ABSOLUTE.test(value) ? line : prefix + base + value;
  });
  if (found === 0) {
    throw new Error("This channel file names no package. Refusing to publish it as a feed.");
  }
  return lines.join("\n");
}

function main(argv) {
  const plan = resolveDesktopPlan(process.env.OMP_DESKTOP_TARGET);
  const tagIndex = argv.indexOf("--tag");
  const tag = tagIndex >= 0 ? argv[tagIndex + 1] : undefined;
  if (!tag) throw new Error("Usage: bun scripts/update-feed.mjs --tag v<version>");

  const root = join(import.meta.dir, "..");
  const channelFile = channelFileName(plan);
  const source = join(root, "desktop", "dist", channelFile);
  if (!existsSync(source)) {
    throw new Error("No channel file at " + source + ". Build the package first.");
  }

  const directory = join(root, "docs", "updates", feedDirectoryName(plan));
  mkdirSync(directory, { recursive: true });
  const feed = absolutiseFeed(readFileSync(source, "utf8"), releaseAssetBase({ tag }));
  const destination = join(directory, channelFile);
  writeFileSync(destination, feed);

  const blockMap = source + ".blockmap";
  if (existsSync(blockMap)) copyFileSync(blockMap, destination + ".blockmap");

  console.log("[update-feed] wrote " + destination + " for " + plan.id + " at " + tag);
  console.log("[update-feed] commit it to main. GitHub Pages serves docs/ and that is the publication.");
}

if (import.meta.main) main(process.argv.slice(2));

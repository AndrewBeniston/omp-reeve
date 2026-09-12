import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  absolutiseFeed,
  channelFileName,
  feedDirectoryName,
  releaseAssetBase,
} from "./update-feed.mjs";

// A real Windows feed, line for line, from the v0.5.0 release.
const WINDOWS_FEED = [
  "version: 0.5.0",
  "files:",
  "  - url: Reeve-Setup-0.5.0.exe",
  "    sha512: AFTysc54ou9487dIDCPqb6FMqAuJq+0yONex/tJpUFA0nnzZI+44yPa8liwVgeMP+l1HIdZJwSc6QLOdY52jkQ==",
  "    size: 343759754",
  "path: Reeve-Setup-0.5.0.exe",
  "sha512: AFTysc54ou9487dIDCPqb6FMqAuJq+0yONex/tJpUFA0nnzZI+44yPa8liwVgeMP+l1HIdZJwSc6QLOdY52jkQ==",
  "releaseDate: '2026-09-10T11:46:30.493Z'",
  "",
].join("\n");

const BASE = "https://github.com/AndrewBeniston/omp-reeve/releases/download/v0.5.0/";

test("the release asset base names one tag", () => {
  assert.equal(
    releaseAssetBase({ owner: "AndrewBeniston", repo: "omp-reeve", tag: "v0.5.0" }),
    BASE,
  );
});

test("every package name becomes a full address, and nothing else changes", () => {
  const feed = absolutiseFeed(WINDOWS_FEED, BASE);

  assert.match(feed, /- url: https:\/\/github\.com\/AndrewBeniston\/omp-reeve\/releases\/download\/v0\.5\.0\/Reeve-Setup-0\.5\.0\.exe/);
  // path is the older field. An older installed Reeve reads it, so it moves too.
  assert.match(feed, /^path: https:\/\/github\.com\/.+\/Reeve-Setup-0\.5\.0\.exe$/m);

  // The hash, the size, the version and the date are untouched.
  assert.match(feed, /^version: 0\.5\.0$/m);
  assert.match(feed, /size: 343759754/);
  assert.match(feed, /releaseDate: '2026-09-10T11:46:30\.493Z'/);
  assert.equal(feed.split("\n").length, WINDOWS_FEED.split("\n").length);
});

test("a feed that is already absolute passes through unchanged", () => {
  const once = absolutiseFeed(WINDOWS_FEED, BASE);
  assert.equal(absolutiseFeed(once, BASE), once);
});

test("a feed with no package name is refused", () => {
  // Silence is the dangerous answer here. A feed with nothing to rewrite means
  // the file is not what we think it is, so it must stop the release.
  assert.throws(() => absolutiseFeed("version: 0.6.0\n", BASE), /no package/i);
});

test("every macOS package in one feed becomes a full address", () => {
  const macFeed = [
    "version: 0.5.0",
    "files:",
    "  - url: Reeve-0.5.0-arm64-mac.zip",
    "    sha512: a==",
    "  - url: Reeve-0.5.0-arm64.dmg",
    "    sha512: b==",
    "  - url: Reeve-0.5.0-mac.zip",
    "    sha512: c==",
    "  - url: Reeve-0.5.0.dmg",
    "    sha512: d==",
    "path: Reeve-0.5.0-arm64-mac.zip",
    "",
  ].join("\n");

  const feed = absolutiseFeed(macFeed, BASE);
  const absolute = feed.split("\n").filter((line) => line.includes("https://"));
  assert.equal(absolute.length, 5);
});

test("each platform reads one channel file from one directory", () => {
  // The name is electron-updater's own. Windows carries no platform word.
  assert.equal(channelFileName({ platform: "win32", arch: "x64" }), "latest.yml");
  assert.equal(channelFileName({ platform: "darwin", arch: "arm64" }), "latest-mac.yml");
  assert.equal(channelFileName({ platform: "darwin", arch: "x64" }), "latest-mac.yml");
  assert.equal(channelFileName({ platform: "linux", arch: "x64" }), "latest-linux.yml");
  assert.equal(channelFileName({ platform: "linux", arch: "arm64" }), "latest-linux-arm64.yml");

  // Both macOS packages share one feed, because they share one channel file.
  assert.equal(feedDirectoryName({ platform: "darwin", arch: "arm64" }), "darwin");
  assert.equal(feedDirectoryName({ platform: "darwin", arch: "x64" }), "darwin");
  assert.equal(feedDirectoryName({ platform: "win32", arch: "x64" }), "win32");
  assert.equal(feedDirectoryName({ platform: "linux", arch: "x64" }), "linux");
});

test("each platform publishes to its own feed, and none to a shared one", () => {
  // A single shared feed is what tied the platforms together. One release then
  // had to carry every platform, or the others reported an error. ADR-0013.
  const root = join(import.meta.dir, "..");
  const build = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).build;

  assert.equal(build.publish, undefined, "a shared feed is back");

  for (const [key, platform] of [["win", "win32"], ["mac", "darwin"], ["linux", "linux"]]) {
    const publish = build[key].publish;
    assert.equal(publish.provider, "generic", key + " must read its own feed");
    assert.ok(
      publish.url.endsWith("/updates/" + platform + "/"),
      key + " points at " + publish.url,
    );
    // The trailing separator matters. electron-updater resolves the channel
    // file against this address, and a missing separator drops the directory.
    assert.ok(publish.url.endsWith("/"), key + " must end with a separator");
  }
});

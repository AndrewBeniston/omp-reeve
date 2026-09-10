import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { parseChangelog, releasedVersions, unseenReleases } = await jiti.import("./changelog.ts");

const sample = `# Changelog

## [Unreleased]

## [0.6.0] - 2026-10-01

### Added
- Something new
  that wraps onto a second line.

## [0.5.1] - 2026-09-15 support: false

### Fixed
- A bug.

## [0.5.0] - 2026-09-08 support: true

### Summary
The first public release.
Two lines of prose.

### Added
- Updates.
- What's New.
`;

test("headers, dates, the support flag, sections, bullets, and wrapped lines parse", () => {
  const releases = parseChangelog(sample);
  assert.deepEqual(releases.map((r) => r.version), ["Unreleased", "0.6.0", "0.5.1", "0.5.0"]);
  const first = releases.find((r) => r.version === "0.5.0");
  assert.equal(first.date, "2026-09-08");
  assert.equal(first.support, true);
  assert.equal(releases.find((r) => r.version === "0.5.1").support, false);
  assert.equal(releases.find((r) => r.version === "0.6.0").support, false);
  assert.deepEqual(first.sections.map((s) => s.title), ["Summary", "Added"]);
  assert.deepEqual(first.sections[0].items, [
    { kind: "paragraph", text: "The first public release. Two lines of prose." },
  ]);
  assert.deepEqual(first.sections[1].items.map((i) => i.text), ["Updates.", "What's New."]);
  const wrapped = releases.find((r) => r.version === "0.6.0").sections[0].items[0];
  assert.equal(wrapped.text, "Something new that wraps onto a second line.");
});

test("Unreleased and empty releases are excluded from the released list", () => {
  assert.deepEqual(releasedVersions(parseChangelog(sample)).map((r) => r.version), ["0.6.0", "0.5.1", "0.5.0"]);
});

test("a first install sees only the current version", () => {
  const releases = parseChangelog(sample);
  assert.deepEqual(unseenReleases(releases, "0.5.1", null).map((r) => r.version), ["0.5.1"]);
});

test("an update shows every version since the last seen one, newest first, never above the running version", () => {
  const releases = parseChangelog(sample);
  assert.deepEqual(unseenReleases(releases, "0.6.0", "0.5.0").map((r) => r.version), ["0.6.0", "0.5.1"]);
  assert.deepEqual(unseenReleases(releases, "0.5.1", "0.5.0").map((r) => r.version), ["0.5.1"]);
  assert.deepEqual(unseenReleases(releases, "0.5.1", "0.5.1"), []);
  assert.deepEqual(unseenReleases(releases, "0.5.1", "0.6.0"), []);
});

test("the repository CHANGELOG.md parses and its newest release matches package.json", async () => {
  const text = await readFile(new URL("../CHANGELOG.md", import.meta.url), "utf8");
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const releases = parseChangelog(text);
  assert.equal(releases[0].version, "Unreleased");
  const newest = releasedVersions(releases)[0] ?? null;
  // Before the first cut, Unreleased holds the notes and no version section exists yet.
  if (newest) assert.equal(newest.version, pkg.version);
});

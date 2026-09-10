import assert from "node:assert/strict";
import test from "node:test";
import { bumpVersion, cutRelease, proposeBump, releaseNotesFor, releaseProblems, unreleasedHasEntries } from "./release-core.mjs";

const fixesOnly = `# Changelog

## [Unreleased]

### Fixed
- A crash.

## [0.5.0] - 2026-09-08 support: true

### Added
- Everything.
`;

const withFeature = fixesOnly.replace("### Fixed\n- A crash.", "### Added\n- A thing.\n\n### Fixed\n- A crash.");
const empty = fixesOnly.replace("### Fixed\n- A crash.\n\n", "");

test("fixes alone propose a patch, any Added entry proposes a minor, empty refuses", () => {
  assert.equal(proposeBump(fixesOnly), "patch");
  assert.equal(proposeBump(withFeature), "minor");
  assert.throws(() => proposeBump(empty), /empty/);
  assert.equal(unreleasedHasEntries(empty), false);
  assert.equal(unreleasedHasEntries(fixesOnly), true);
});

test("bumpVersion follows semver", () => {
  assert.equal(bumpVersion("0.5.0", "patch"), "0.5.1");
  assert.equal(bumpVersion("0.5.3", "minor"), "0.6.0");
  assert.equal(bumpVersion("0.9.9", "major"), "1.0.0");
  assert.throws(() => bumpVersion("dev", "patch"), /non-semver/);
});

test("cutRelease moves the entries under a dated header and leaves Unreleased empty", () => {
  const out = cutRelease(fixesOnly, { version: "0.5.1", date: "2026-09-15" });
  assert.match(out, /## \[Unreleased\]\n\n## \[0\.5\.1\] - 2026-09-15\n\n### Fixed\n- A crash\.\n\n## \[0\.5\.0\]/);
  assert.equal(releaseNotesFor(out, "0.5.1"), "### Fixed\n- A crash.");
  assert.equal(unreleasedHasEntries(out), false);
  const supported = cutRelease(fixesOnly, { version: "0.5.1", date: "2026-09-15", support: true });
  assert.match(supported, /## \[0\.5\.1\] - 2026-09-15 support: true/);
});

test("releaseNotesFor returns the body of one version only", () => {
  assert.equal(releaseNotesFor(fixesOnly, "0.5.0"), "### Added\n- Everything.");
  assert.equal(releaseNotesFor(fixesOnly, "9.9.9"), "");
});

test("releaseProblems catches a version mismatch, a bad tag, and a tag with no notes", () => {
  const ok = { changelog: fixesOnly, packageVersion: "0.5.0", desktopVersion: "0.5.0" };
  assert.deepEqual(releaseProblems(ok), []);
  assert.deepEqual(releaseProblems({ ...ok, tag: "v0.5.0" }), []);
  assert.match(releaseProblems({ ...ok, desktopVersion: "0.4.9" })[0], /desktop\/package\.json is 0\.4\.9/);
  assert.match(releaseProblems({ ...ok, tag: "v0.5.1" })[0], /Tag v0\.5\.1 does not match/);
  assert.match(releaseProblems({ ...ok, packageVersion: "0.5.1", desktopVersion: "0.5.1", tag: "v0.5.1" })[0], /no \[0\.5\.1\] section/);
});

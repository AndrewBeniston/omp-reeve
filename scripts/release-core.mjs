/**
 * Pure release rules for Reeve (ADR-0006, RELEASING.md).
 *
 * No file or Git access lives here, so the rules are testable. The CLI in
 * scripts/release.mjs and the CI check in scripts/release-check.mjs call in.
 */

import { parseChangelog, releasedVersions } from "../lib/changelog.ts";

export const UNRELEASED_HEADER = "## [Unreleased]";

/** Section titles that mean a feature was added, so the bump is minor. */
const MINOR_SECTIONS = new Set(["added", "changed", "removed"]);

export function unreleasedRelease(text) {
  return parseChangelog(text).find((release) => release.version === "Unreleased") ?? null;
}

export function unreleasedHasEntries(text) {
  const release = unreleasedRelease(text);
  return Boolean(release && release.sections.some((section) => section.items.length > 0));
}

export function bumpVersion(current, kind) {
  const [major, minor, patch] = current.split(".").map((part) => Number.parseInt(part, 10));
  if ([major, minor, patch].some((part) => Number.isNaN(part))) {
    throw new Error(`Cannot bump a non-semver version: ${current}`);
  }
  if (kind === "major") return `${major + 1}.0.0`;
  if (kind === "minor") return `${major}.${minor + 1}.0`;
  if (kind === "patch") return `${major}.${minor}.${patch + 1}`;
  throw new Error(`Unknown bump kind: ${kind}`);
}

/**
 * Patch when Unreleased holds only fixes. Minor when any Added, Changed, or
 * Removed entry exists. Major is never proposed. A person chooses it.
 */
export function proposeBump(text) {
  const release = unreleasedRelease(text);
  if (!release) throw new Error("CHANGELOG.md has no [Unreleased] section.");
  const titles = release.sections
    .filter((section) => section.items.length > 0)
    .map((section) => section.title.toLowerCase());
  if (titles.length === 0) throw new Error("The [Unreleased] section is empty. Add an entry before a release.");
  return titles.some((title) => MINOR_SECTIONS.has(title)) ? "minor" : "patch";
}

/** Move the Unreleased body under a new dated header and leave Unreleased empty. */
export function cutRelease(text, { version, date, support = false }) {
  const start = text.indexOf(UNRELEASED_HEADER);
  if (start === -1) throw new Error("CHANGELOG.md has no [Unreleased] section.");
  const bodyStart = start + UNRELEASED_HEADER.length;
  const nextHeader = text.indexOf("\n## [", bodyStart);
  const body = nextHeader === -1 ? text.slice(bodyStart) : text.slice(bodyStart, nextHeader);
  const rest = nextHeader === -1 ? "" : text.slice(nextHeader);
  const header = `## [${version}] - ${date}${support ? " support: true" : ""}`;
  return `${text.slice(0, start)}${UNRELEASED_HEADER}\n\n${header}${body.replace(/\s+$/, "")}\n${rest}`;
}

/** The markdown body of one version, for the GitHub release. */
export function releaseNotesFor(text, version) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line.startsWith(`## [${version}]`));
  if (start === -1) return "";
  const out = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith("## [")) break;
    out.push(line);
  }
  return out.join("\n").trim();
}

export function latestReleasedVersion(text) {
  return releasedVersions(parseChangelog(text))[0]?.version ?? null;
}

/**
 * What CI asserts on every push and on every tag.
 * Returns a list of problems. An empty list means the repository is release-ready.
 */
export function releaseProblems({ changelog, desktopVersion, packageVersion, tag = null }) {
  const problems = [];
  if (packageVersion !== desktopVersion) {
    problems.push(`package.json is ${packageVersion} but desktop/package.json is ${desktopVersion}. Run bun run desktop:sync-version.`);
  }
  if (!changelog.includes(UNRELEASED_HEADER)) {
    problems.push("CHANGELOG.md has no [Unreleased] section.");
  }
  if (tag !== null) {
    if (tag !== `v${packageVersion}`) {
      problems.push(`Tag ${tag} does not match package.json version ${packageVersion}.`);
    }
    const notes = releaseNotesFor(changelog, packageVersion);
    if (!notes) {
      problems.push(`CHANGELOG.md has no [${packageVersion}] section with entries. Run bun run release before you tag.`);
    }
  }
  return problems;
}

/**
 * Parser for CHANGELOG.md in Keep a Changelog form.
 *
 * Header forms accepted:
 *   ## [Unreleased]
 *   ## [0.5.0] - 2026-09-08
 *   ## [0.5.0] - 2026-09-08 support: true
 *
 * The parser is pure and has no file access, so the API route and the tests
 * both feed it text.
 */

export interface ChangelogItem {
  kind: "bullet" | "paragraph";
  text: string;
}

export interface ChangelogSection {
  title: string;
  items: ChangelogItem[];
}

export interface ChangelogRelease {
  version: string;
  date: string | null;
  support: boolean;
  sections: ChangelogSection[];
}

const HEADER = /^## \[([^\]]+)\](?:\s*-\s*(\d{4}-\d{2}-\d{2}))?(?:\s+support:\s*(true|false))?\s*$/;

export function parseChangelog(text: string): ChangelogRelease[] {
  const releases: ChangelogRelease[] = [];
  let release: ChangelogRelease | null = null;
  let section: ChangelogSection | null = null;
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length && section) {
      section.items.push({ kind: "paragraph", text: paragraph.join(" ").trim() });
    }
    paragraph = [];
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/, "");
    const header = HEADER.exec(line);
    if (header) {
      flushParagraph();
      release = { version: header[1], date: header[2] ?? null, support: header[3] === "true", sections: [] };
      section = null;
      releases.push(release);
      continue;
    }
    if (!release) continue;
    if (line.startsWith("### ")) {
      flushParagraph();
      section = { title: line.slice(4).trim(), items: [] };
      release.sections.push(section);
      continue;
    }
    if (!section) continue;
    if (/^[-*] /.test(line)) {
      flushParagraph();
      section.items.push({ kind: "bullet", text: line.slice(2).trim() });
      continue;
    }
    if (/^\s{2,}\S/.test(line) && section.items.at(-1)?.kind === "bullet") {
      const last = section.items[section.items.length - 1];
      last.text = `${last.text} ${line.trim()}`;
      continue;
    }
    if (line.trim() === "") {
      flushParagraph();
      continue;
    }
    paragraph.push(line.trim());
  }
  flushParagraph();
  return releases;
}

export function releasedVersions(releases: ChangelogRelease[]): ChangelogRelease[] {
  return releases.filter((release) => release.version !== "Unreleased" && release.sections.length > 0);
}

function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.-]/).map((part) => Number.parseInt(part, 10));
  const pb = b.split(/[.-]/).map((part) => Number.parseInt(part, 10));
  for (let index = 0; index < Math.max(pa.length, pb.length); index += 1) {
    const da = Number.isNaN(pa[index]) ? 0 : (pa[index] ?? 0);
    const db = Number.isNaN(pb[index]) ? 0 : (pb[index] ?? 0);
    if (da !== db) return da - db;
  }
  return 0;
}

/**
 * The releases a user has not seen yet, newest first, capped at the running
 * version. A null lastSeen means a first install: show only the current
 * version, not the whole history.
 */
export function unseenReleases(
  releases: ChangelogRelease[],
  currentVersion: string,
  lastSeenVersion: string | null,
): ChangelogRelease[] {
  const released = releasedVersions(releases)
    .filter((release) => compareVersions(release.version, currentVersion) <= 0);
  if (lastSeenVersion === null) {
    return released.filter((release) => release.version === currentVersion);
  }
  return released.filter((release) => compareVersions(release.version, lastSeenVersion) > 0);
}

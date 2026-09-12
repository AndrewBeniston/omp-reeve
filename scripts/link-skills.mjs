#!/usr/bin/env bun
/**
 * Mirror .agents/skills into .claude/skills.
 *
 * .agents/skills is the source of truth. omp reads it, and Codex reads it.
 * Claude Code reads .claude/skills only, so each skill needs a link there.
 *
 * The links are made on the machine and are never committed. Git on Windows
 * writes a committed symbolic link out as a text file, and it stores a junction
 * as a second copy of the folder. Both break the mirror.
 *
 * Usage:
 *   bun run skills:link
 *   bun run skills:link --check
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_RELATIVE = path.join(".agents", "skills");
const TARGET_RELATIVE = path.join(".claude", "skills");

/** The repository root, measured from this file. */
export function repoRootFromScript() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

/** Every folder in the source that holds a SKILL.md file, sorted by name. */
export function listSkillFolders(sourceDir) {
  let entries;
  try {
    entries = fs.readdirSync(sourceDir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => fs.existsSync(path.join(sourceDir, name, "SKILL.md")))
    .sort();
}

function resolveOrNull(target) {
  try {
    return fs.realpathSync(target);
  } catch {
    return null;
  }
}

function removeLink(linkPath) {
  try {
    fs.unlinkSync(linkPath);
    return;
  } catch {
    fs.rmdirSync(linkPath);
  }
}

function createLink(sourcePath, linkPath) {
  if (process.platform === "win32") {
    // A junction needs no administrator rights. A symbolic link does.
    fs.symlinkSync(sourcePath, linkPath, "junction");
    return;
  }
  const relative = path.relative(path.dirname(linkPath), sourcePath);
  fs.symlinkSync(relative, linkPath, "dir");
}

/**
 * Link every source skill into the Claude Code folder.
 *
 * The report separates the five outcomes. A real folder in the target that is
 * not a link is kept and reported, never removed.
 */
export function linkSkills(options = {}) {
  const repoRoot = options.repoRoot ?? repoRootFromScript();
  const check = options.check === true;
  const sourceDir = path.join(repoRoot, SOURCE_RELATIVE);
  const targetDir = path.join(repoRoot, TARGET_RELATIVE);
  const report = { linked: [], ok: [], replaced: [], kept: [], missing: [] };

  const names = listSkillFolders(sourceDir);
  if (names.length === 0) {
    return report;
  }
  if (!check) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  for (const name of names) {
    const sourcePath = path.join(sourceDir, name);
    const linkPath = path.join(targetDir, name);
    let state = null;
    try {
      state = fs.lstatSync(linkPath);
    } catch {
      state = null;
    }

    if (state && !state.isSymbolicLink()) {
      report.kept.push(name);
      continue;
    }
    if (state && resolveOrNull(linkPath) === resolveOrNull(sourcePath)) {
      report.ok.push(name);
      continue;
    }
    if (check) {
      report.missing.push(name);
      continue;
    }
    if (state) {
      removeLink(linkPath);
      createLink(sourcePath, linkPath);
      report.replaced.push(name);
      continue;
    }
    createLink(sourcePath, linkPath);
    report.linked.push(name);
  }
  return report;
}

function describe(report) {
  return [
    "linked " + report.linked.length,
    "already correct " + report.ok.length,
    "replaced " + report.replaced.length,
    "kept " + report.kept.length,
  ].join(", ");
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const check = process.argv.includes("--check");
  const report = linkSkills({ check });
  if (check) {
    if (report.missing.length > 0) {
      console.error("Claude Code is missing " + report.missing.length + " skill links.");
      console.error("Run: bun run skills:link");
      process.exit(1);
    }
    console.log("Every skill is linked for Claude Code.");
  } else {
    console.log(describe(report));
    if (report.kept.length > 0) {
      console.log("Kept as real folders: " + report.kept.join(", "));
    }
  }
}

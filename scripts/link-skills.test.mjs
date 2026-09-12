import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { linkSkills, listSkillFolders } from "./link-skills.mjs";

function makeRepo(skillNames) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "reeve-skill-link-"));
  const sourceDir = path.join(root, ".agents", "skills");
  fs.mkdirSync(sourceDir, { recursive: true });
  for (const name of skillNames) {
    fs.mkdirSync(path.join(sourceDir, name), { recursive: true });
    fs.writeFileSync(path.join(sourceDir, name, "SKILL.md"), "# " + name + "\n");
  }
  return { root, sourceDir, targetDir: path.join(root, ".claude", "skills") };
}

test("a folder counts as a skill only when it holds a SKILL.md file", () => {
  const repo = makeRepo(["release-reeve", "tdd"]);
  fs.mkdirSync(path.join(repo.sourceDir, "not-a-skill"));
  fs.writeFileSync(path.join(repo.sourceDir, "README.md"), "notes");

  assert.deepEqual(listSkillFolders(repo.sourceDir), ["release-reeve", "tdd"]);
});

test("every skill is readable through its link", () => {
  const repo = makeRepo(["release-reeve", "tdd"]);

  const report = linkSkills({ repoRoot: repo.root });

  assert.deepEqual(report.linked, ["release-reeve", "tdd"]);
  const linked = path.join(repo.targetDir, "release-reeve", "SKILL.md");
  assert.equal(fs.readFileSync(linked, "utf8"), "# release-reeve\n");
});

test("a second run changes nothing", () => {
  const repo = makeRepo(["release-reeve"]);

  linkSkills({ repoRoot: repo.root });
  const second = linkSkills({ repoRoot: repo.root });

  assert.deepEqual(second.linked, []);
  assert.deepEqual(second.replaced, []);
  assert.deepEqual(second.ok, ["release-reeve"]);
});

test("a real folder in the target is kept, never removed", () => {
  const repo = makeRepo(["release-reeve"]);
  const real = path.join(repo.targetDir, "release-reeve");
  fs.mkdirSync(real, { recursive: true });
  fs.writeFileSync(path.join(real, "SKILL.md"), "hand written");

  const report = linkSkills({ repoRoot: repo.root });

  assert.deepEqual(report.kept, ["release-reeve"]);
  assert.equal(fs.readFileSync(path.join(real, "SKILL.md"), "utf8"), "hand written");
});

test("the check reports a missing link and creates nothing", () => {
  const repo = makeRepo(["release-reeve"]);

  const report = linkSkills({ repoRoot: repo.root, check: true });

  assert.deepEqual(report.missing, ["release-reeve"]);
  assert.equal(fs.existsSync(repo.targetDir), false);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = join(import.meta.dir, "..");
const skill = readFileSync(join(root, ".agents", "skills", "release-reeve", "SKILL.md"), "utf8");
const releasing = readFileSync(join(root, "RELEASING.md"), "utf8");

test("the release skill points at sections RELEASING.md still has", () => {
  // The skill holds the order and sends the agent to RELEASING.md for the
  // commands. A renamed section leaves it pointing at nothing, and the agent
  // then invents a step.
  for (const section of ["Before every release", "Publish the packages"]) {
    assert.ok(skill.includes(section), "the skill names " + section);
    assert.ok(releasing.includes("## " + section), "RELEASING.md still has " + section);
  }
});

test("the release skill names every target the build supports", () => {
  // A target the skill cannot name is a platform the user cannot release.
  const targets = Object.keys(JSON.parse(readFileSync(join(root, "desktop", "targets.json"), "utf8")));
  const named = targets.filter((id) => skill.includes(id));
  const missing = targets.filter((id) => !skill.includes(id) && id !== "darwin-universal");
  assert.deepEqual(missing, [], "the skill does not name " + missing.join(", "));
  assert.ok(named.length >= 4);
});

test("the release skill fires from the words a user actually says", () => {
  // The description is the pointer. Its wording decides whether the agent
  // reaches the skill at all.
  const description = /^description:\s*(.+)$/m.exec(skill)?.[1] ?? "";
  for (const word of ["release", "ship", "publish", "platform"]) {
    assert.match(description, new RegExp(word, "i"), "the description misses " + word);
  }
  // Model-invoked on purpose, so the agent can reach it without a typed name.
  assert.doesNotMatch(skill, /disable-model-invocation:\s*true/);
});

test("every step of the release skill ends on a checkable condition", () => {
  const steps = skill.split("\n").filter((line) => /^## Step \d/.test(line));
  const criteria = skill.split("\n").filter((line) => line.startsWith("Done when"));
  assert.ok(steps.length >= 7, "found " + steps.length + " steps");
  assert.equal(criteria.length, steps.length, "each step needs one Done when line");
});

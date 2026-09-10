import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const { buildSlashSections, flattenSuggestionSections } = await jiti.import("../lib/composer-intelligence.ts");

test("uses one ordered suggestion list for slash command selection", () => {
  const sections = buildSlashSections({
    query: "",
    commands: [
      { name: "skill:alpha", description: "Manual skill", source: "skill" },
      { name: "skill:beta", description: "Active skill", source: "skill" },
      { name: "compact", description: "Compact", source: "builtin" },
    ],
    skills: [
      {
        name: "alpha",
        description: "Manual skill",
        filePath: "/skills/alpha/SKILL.md",
        baseDir: "/skills/alpha",
        disableModelInvocation: true,
        sourceInfo: { scope: "user" },
      },
      {
        name: "beta",
        description: "Active skill",
        filePath: "/skills/beta/SKILL.md",
        baseDir: "/skills/beta",
        disableModelInvocation: false,
        sourceInfo: { scope: "project" },
      },
    ],
  });

  assert.deepEqual(
    flattenSuggestionSections(sections).map((item) => item.raw),
    ["/compact", "/skill:alpha", "/skill:beta"],
  );
  assert.equal(flattenSuggestionSections(sections)[1].label, "Alpha");
  assert.equal(flattenSuggestionSections(sections)[1].detail, "Manual skill");
});

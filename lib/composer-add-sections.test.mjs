import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
const { buildComposerAddSections } = await createJiti(import.meta.url, { tsconfigPaths: true }).import("./composer-intelligence.ts");
test("Add exposes every available command rather than the autocomplete preview limit", () => {
  const commands = Array.from({ length: 75 }, (_, index) => ({ name: `command-${index}`, source: "extension" }));
  const sections = buildComposerAddSections({ commands, skills: [], plugins: [] });
  assert.equal(sections.flatMap(section => section.items).length, 75);
});
test("Add prioritizes discovered goal and plan commands without inventing them", () => {
  const commands = ["z", "plan", "goal", "a", "goal"].map(name => ({ name, source: "extension" }));
  const items = buildComposerAddSections({ commands, skills: [], plugins: [] })[0].items;
  assert.deepEqual(items.map(item => item.raw), ["/goal", "/plan", "/a", "/z"]);
  assert.deepEqual(buildComposerAddSections({ commands: [], skills: [], plugins: [] }), []);
});

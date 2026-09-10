import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const {
  buildAtMentionSections,
  buildRecognizedComposerMentions,
  buildSlashSections,
  buildSlashSubcommandSections,
  extractSlashQuery,
  flattenSuggestionSections,
  formatComposerName,
  resolveAutocompleteSelection,
} = await jiti.import("./composer-intelligence.ts");

const skills = [{
  name: "codebase-design",
  description: "Design deep modules with small interfaces.",
  filePath: "/Users/example/.agents/skills/codebase-design/SKILL.md",
  baseDir: "/Users/example/.agents/skills/codebase-design",
  disableModelInvocation: false,
  sourceInfo: { scope: "user" },
}, {
  name: "gpt-image-2",
  description: "Create images with GPT Image 2.",
  filePath: "/repo/.agents/skills/gpt-image-2/SKILL.md",
  baseDir: "/repo/.agents/skills/gpt-image-2",
  disableModelInvocation: true,
  sourceInfo: { scope: "project" },
}];

const plugins = [{
  source: "@injaneity/pi-computer-use",
  packageName: "@injaneity/pi-computer-use",
  filtered: false,
  disabled: false,
  counts: { extensions: 1, skills: 0, prompts: 0, themes: 0 },
  resources: [],
  status: "loaded",
}];

test("formats skill names without exposing their filesystem paths", () => {
  assert.equal(formatComposerName("codebase-design"), "Codebase Design");
  assert.equal(formatComposerName("gpt-image-2"), "GPT Image 2");
  assert.equal(formatComposerName("add-dir"), "Add Directory");
  assert.equal(formatComposerName("use-this-skill"), "Use This Skill");
  assert.equal(formatComposerName("dirs"), "Directories");
  assert.equal(formatComposerName("ssh"), "SSH");
  assert.equal(formatComposerName("collab"), "Collaboration");

  const items = flattenSuggestionSections(buildAtMentionSections({
    query: "code",
    files: [],
    skills,
    plugins,
  }));
  const codebase = items.find((item) => item.raw === "/skill:codebase-design");
  assert.equal(codebase.label, "Codebase Design");
  assert.equal(codebase.detail, "Design deep modules with small interfaces.");
  assert.doesNotMatch(JSON.stringify(items), /Users\/example/);
  assert.equal(items[0].raw, "/skill:codebase-design");
});

test("offers the loaded OMP computer-use plugin as an @ mention", () => {
  const items = flattenSuggestionSections(buildAtMentionSections({
    query: "computer",
    files: [],
    skills,
    plugins,
  }));
  const computer = items.find((item) => item.kind === "computer-use");
  assert.ok(computer);
  assert.equal(computer.label, "Computer Use");
  assert.equal(computer.raw, "@computer");
  assert.equal(computer.rightLabel, "Plugin");
});

test("offers live OMP subagents through their agent URL", () => {
  const items = flattenSuggestionSections(buildAtMentionSections({
    query: "reviewer",
    files: [],
    skills: [],
    plugins: [],
    subagents: [{
      id: "review-1",
      index: 0,
      agent: "Reviewer",
      agentSource: "project",
      status: "running",
      task: "Inspect the current changes",
      lastUpdate: 1,
    }],
  }));
  assert.equal(items[0].kind, "agent");
  assert.equal(items[0].raw, "agent://review-1");
  assert.equal(items[0].detail, "Inspect the current changes");
  assert.equal(items[0].rightLabel, "Running");
});

test("keeps manual skills available because users can still invoke them", () => {
  const items = flattenSuggestionSections(buildAtMentionSections({
    query: "image",
    files: [],
    skills,
    plugins,
  }));
  assert.equal(items[0].raw, "/skill:gpt-image-2");
  assert.equal(items[0].rightLabel, "Project");
});

test("shows file names and directories separately", () => {
  const sections = buildAtMentionSections({
    query: "chat",
    files: [
      { path: "components/ChatInput.tsx", isDir: false },
      { path: "components/chat", isDir: true },
    ],
    skills: [],
    plugins: [],
  });
  const items = flattenSuggestionSections(sections);
  assert.deepEqual(items.map((item) => item.label), ["chat/", "ChatInput.tsx"]);
  assert.equal(items[1].detail, "components");
  assert.equal(items[1].raw, "@components/ChatInput.tsx");
});

test("ranks an exact file before skills that mention its name in descriptions", () => {
  const distractorSkills = Array.from({ length: 8 }, (_, index) => ({
    name: `skill-${index}`,
    description: "This skill can edit AGENTS files.",
    filePath: `/skills/${index}/SKILL.md`,
    baseDir: `/skills/${index}`,
    disableModelInvocation: false,
    sourceInfo: { scope: "user" },
  }));
  const items = flattenSuggestionSections(buildAtMentionSections({
    query: "AGENTS",
    files: [
      { path: "AGENTS.md", isDir: false },
      { path: "docs/agents", isDir: true },
      { path: ".agents/skills/code-review/agents", isDir: true },
    ],
    skills: distractorSkills,
    plugins: [],
  }));

  assert.equal(items[0].raw, "@AGENTS.md");
  assert.ok(items.some((item) => item.raw === "@AGENTS.md"));
});

test("groups OMP slash commands and replaces skill paths with skill metadata", () => {
  const sections = buildSlashSections({
    query: "",
    commands: [
      { name: "compact", source: "builtin", description: "Compact context" },
      { name: "computer-use", source: "extension", description: "Show configuration" },
      { name: "skill:codebase-design", source: "skill", path: skills[0].filePath },
    ],
    skills,
  });
  assert.deepEqual(sections.map((section) => section.id), ["commands", "skills"]);
  const skill = flattenSuggestionSections(sections).find((item) => item.kind === "skill");
  const command = flattenSuggestionSections(sections).find((item) => item.raw === "/compact");
  assert.equal(command.label, "Compact");
  assert.doesNotMatch(command.label, /\//);
  assert.equal(skill.label, "Codebase Design");
  assert.equal(skill.detail, "Design deep modules with small interfaces.");
  assert.doesNotMatch(JSON.stringify(skill), /SKILL\.md/);
  assert.equal(flattenSuggestionSections(sections).find((item) => item.raw === "/compact").icon, "action");
  assert.equal(skill.icon, "skill");

  const searched = flattenSuggestionSections(buildSlashSections({
    query: "codebase",
    commands: [
      { name: "init", source: "builtin", description: "Generate AGENTS.md for the current codebase" },
      { name: "skill:codebase-design", source: "skill" },
    ],
    skills,
  }));
  assert.equal(searched[0].raw, "/skill:codebase-design");
});

test("builds a recognition catalog for restored command, skill, file, and plugin chips", () => {
  const tokens = buildRecognizedComposerMentions({
    skills,
    plugins,
    commands: [
      { name: "compact", source: "builtin" },
      { name: "collab", source: "builtin", subcommands: [{ name: "view" }] },
    ],
    files: [{ path: "components/ChatInput.tsx", isDir: false }],
  });
  assert.deepEqual(tokens.map((token) => token.raw), [
    "/skill:codebase-design",
    "/skill:gpt-image-2",
    "/compact",
    "/collab",
    "/collab view",
    "@components/ChatInput.tsx",
    "@computer",
  ]);
  assert.equal(tokens.find((token) => token.raw === "/collab view").label, "Collaboration: View");
  assert.equal(tokens.find((token) => token.raw === "/compact").icon, "action");
  assert.equal(tokens.find((token) => token.raw === "/collab view").icon, "action");
  assert.equal(tokens.find((token) => token.raw === "/skill:codebase-design").icon, "skill");
  assert.equal(tokens.find((token) => token.raw === "@components/ChatInput.tsx").icon, "file");
  assert.equal(tokens.find((token) => token.raw === "@computer").icon, "computer");
});

test("opens a second command level only for registered subcommands", () => {
  const commands = [{
    name: "mcp",
    source: "builtin",
    subcommands: [
      { name: "status", description: "Show MCP server status" },
      { name: "reload", description: "Reload MCP servers" },
    ],
  }];
  assert.deepEqual(extractSlashQuery("/mcp st", commands), {
    query: "st",
    parentCommand: commands[0],
  });
  assert.equal(extractSlashQuery("/compact now", commands), null);

  const sections = buildSlashSubcommandSections(commands[0], "st");
  assert.equal(sections[0].title, "MCP");
  assert.equal(sections[0].items[0].raw, "/mcp status");
  assert.equal(sections[0].items[0].label, "Status");
  assert.equal(sections[0].items[0].mentionLabel, "MCP: Status");
});

test("captures Enter during loading without submitting an unfinished token", () => {
  assert.deepEqual(resolveAutocompleteSelection("Enter", false, [], 0), { captured: true, item: undefined });
  assert.deepEqual(resolveAutocompleteSelection("Tab", false, ["one"], 0), { captured: true, item: "one" });
  assert.deepEqual(resolveAutocompleteSelection("Enter", true, ["one"], 0), { captured: false });
});

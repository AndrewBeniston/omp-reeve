import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { buildSettingsNavigation } = await jiti.import("./settings-navigation.ts");

const coreSections = [
  { id: "models", label: "Models", icon: "model" },
  { id: "themes", label: "Themes", icon: "theme" },
  { id: "skills", label: "Skills", icon: "skill" },
  { id: "plugins", label: "Plugins", icon: "plugin" },
  { id: "mcp", label: "MCP", icon: "mcp" },
  { id: "access", label: "Access", icon: "access" },
  { id: "archived", label: "Archived chats", icon: "archive" },
];

const ompTabs = [
  { id: "appearance", label: "Appearance" },
  { id: "model", label: "Model" },
  { id: "interaction", label: "Interaction" },
  { id: "context", label: "Context" },
  { id: "memory", label: "Memory" },
  { id: "files", label: "Files" },
  { id: "shell", label: "Shell" },
  { id: "tools", label: "Tools" },
  { id: "tasks", label: "Tasks" },
  { id: "providers", label: "Providers" },
];

test("maps every Reeve and OMP section into the current Codex navigation groups", () => {
  const items = buildSettingsNavigation(coreSections, ompTabs);

  assert.deepEqual(
    items.map((item) => [item.group.label, item.label, item.id]),
    [
      ["Personal", "General", "settings:interaction"],
      ["Personal", "Appearance", "themes"],
      ["Personal", "Terminal appearance", "settings:appearance"],
      ["Personal", "Security", "access"],
      ["Integrations", "Skills", "skills"],
      ["Integrations", "Plugins", "plugins"],
      ["Integrations", "MCP servers", "mcp"],
      ["Integrations", "Services", "settings:providers"],
      ["Coding", "Models", "models"],
      ["Coding", "Agent behavior", "settings:model"],
      ["Coding", "Context", "settings:context"],
      ["Coding", "Memory", "settings:memory"],
      ["Coding", "Files", "settings:files"],
      ["Coding", "Shell", "settings:shell"],
      ["Coding", "Tools", "settings:tools"],
      ["Coding", "Tasks", "settings:tasks"],
      ["Archived", "Archived chats", "archived"],
    ],
  );
  assert.equal(new Set(items.map((item) => item.id)).size, coreSections.length + ompTabs.length);
  assert.ok(items.every((item) => item.description.length > 0));
});

test("keeps an unknown OMP section visible inside Coding", () => {
  const [item] = buildSettingsNavigation([], [{ id: "future", label: "Future" }]);

  assert.equal(item.id, "settings:future");
  assert.equal(item.label, "Future");
  assert.equal(item.group.label, "Coding");
  assert.match(item.description, /OMP/);
});

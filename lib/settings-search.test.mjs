import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { buildSettingsSearchResults } = await jiti.import("./settings-search.ts");

const navigation = [
  {
    id: "access",
    label: "Security",
    description: "Protect Reeve web access with a local password.",
    icon: "access",
    group: { id: "personal", label: "Personal" },
    rank: 40,
  },
  {
    id: "settings:model",
    label: "Agent behavior",
    description: "Choose thinking, prompting, sampling, and retry behavior.",
    icon: "model",
    group: { id: "coding", label: "Coding" },
    rank: 20,
  },
];

const fields = [
  {
    path: "retry.maxRetries",
    tab: "model",
    group: "Retry & Fallback",
    label: "Retry Attempts",
    description: "Maximum retry attempts.",
  },
  {
    path: "defaultThinkingLevel",
    tab: "model",
    group: "Thinking",
    label: "Thinking Level",
    description: "Default reasoning effort.",
  },
];

test("finds a core Settings destination that owns no OMP fields", () => {
  const results = buildSettingsSearchResults("password", navigation, fields);

  assert.deepEqual(results.map((result) => [result.kind, result.label, result.sectionId]), [
    ["section", "Security", "access"],
  ]);
});

test("finds OMP fields and preserves their mapped destination", () => {
  const results = buildSettingsSearchResults("retry", navigation, fields);

  assert.deepEqual(results.map((result) => [result.kind, result.label, result.context, result.sectionId, result.fieldPath]), [
    ["section", "Agent behavior", "Coding", "settings:model", undefined],
    ["field", "Retry Attempts", "Agent behavior · Retry & Fallback", "settings:model", "retry.maxRetries"],
  ]);
});

test("returns no results for blank or unmatched text", () => {
  assert.deepEqual(buildSettingsSearchResults("", navigation, fields), []);
  assert.deepEqual(buildSettingsSearchResults("not-present", navigation, fields), []);
});

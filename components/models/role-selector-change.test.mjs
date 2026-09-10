import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { resolveRoleModelChange } = await jiti.import("./role-selector-change.ts");

test("an empty pick unsets the role", () => {
  assert.equal(resolveRoleModelChange({ value: "", currentSelector: "openai/gpt-5:high" }), null);
});

test("a supported thinking level survives a model change", () => {
  assert.equal(
    resolveRoleModelChange({
      value: "anthropic/claude",
      currentSelector: "openai/gpt-5:high",
      supportedLevels: ["low", "high"],
    }),
    "anthropic/claude:high",
  );
});

test("an unsupported thinking level falls back to inherit", () => {
  assert.equal(
    resolveRoleModelChange({
      value: "anthropic/claude",
      currentSelector: "openai/gpt-5:xhigh",
      supportedLevels: ["low", "medium"],
    }),
    "anthropic/claude",
  );
});

test("off and auto stay available on every model", () => {
  assert.equal(
    resolveRoleModelChange({
      value: "anthropic/claude",
      currentSelector: "openai/gpt-5:off",
      supportedLevels: [],
    }),
    "anthropic/claude:off",
  );
});

test("a role with no selector picks the plain model selector", () => {
  assert.equal(resolveRoleModelChange({ value: "openai/gpt-5" }), "openai/gpt-5");
});

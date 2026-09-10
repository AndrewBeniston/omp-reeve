import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const shellFiles = [
  "./AppShell.tsx",
];

test("shell interface colors use Tier 2 semantic tokens", async () => {
  for (const file of shellFiles) {
    const source = await readFile(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(source, /#[0-9a-f]{3,8}\b|rgba?\s*\(/i, file);
  }
});

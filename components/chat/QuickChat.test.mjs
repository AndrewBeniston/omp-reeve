import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Quick chat uses an existing chat folder without creating a scratch folder", async () => {
  const source = await readFile(new URL("./QuickChat.tsx", import.meta.url), "utf8");

  assert.match(source, /initialCwd/);
  assert.doesNotMatch(source, /\/api\/default-cwd/);
});

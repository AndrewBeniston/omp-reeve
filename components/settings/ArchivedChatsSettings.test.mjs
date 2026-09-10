import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./ArchivedChatsSettings.tsx", import.meta.url), "utf8");

test("moves archived chat recovery into Settings without deletion", () => {
  assert.match(source, /\/api\/sessions\?archived=1/);
  assert.match(source, /JSON\.stringify\(\{ archived: false \}\)/);
  assert.match(source, /settings\.archivedChats\.title/);
  assert.match(source, /settings\.archivedChats\.restore/);
  assert.doesNotMatch(source, /method:\s*["']DELETE["']|delete archived|Delete all/i);
});

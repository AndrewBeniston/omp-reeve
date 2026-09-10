import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./ActivityArchiveDialog.tsx", import.meta.url), "utf8");

test("explains that active Priority chats stop before archiving", () => {
  assert.match(source, /`Stop and archive \$\{count\} \$\{chats\}\?`/);
  assert.match(source, /Archiving stops ongoing work/);
  assert.match(source, /includesRunning \? "Stop and archive" : "Archive"/);
});

test("keeps recent chats outside a normal Priority archive", () => {
  assert.match(source, /`Archive \$\{count\} priority \$\{chats\}\?`/);
  assert.match(source, /Recent chats will not be archived/);
});

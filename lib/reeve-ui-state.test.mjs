import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { readProjectOrder, writeProjectOrder } from "./reeve-ui-state.ts";

test("stores project order in Reeve application state", () => {
  const agentDir = mkdtempSync(join(tmpdir(), "reeve-ui-state-"));

  writeProjectOrder(["/projects/b", "/projects/a", "/projects/b"], agentDir);

  assert.deepEqual(readProjectOrder(agentDir), ["/projects/b", "/projects/a"]);
  const saved = JSON.parse(readFileSync(join(agentDir, "reeve-ui-state.json"), "utf8"));
  assert.deepEqual(saved, {
    version: 1,
    projectOrder: ["/projects/b", "/projects/a"],
  });
});

test("returns an empty order for missing or invalid application state", () => {
  const agentDir = mkdtempSync(join(tmpdir(), "reeve-ui-state-"));
  assert.deepEqual(readProjectOrder(agentDir), []);
});

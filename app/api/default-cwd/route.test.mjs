import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the retired default-cwd route cannot create dated scratch folders", async () => {
  const source = await readFile(new URL("./route.ts", import.meta.url), "utf8");

  assert.doesNotMatch(source, /mkdirSync|homedir|omp-cwd-/);
});

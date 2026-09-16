import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

/*
 * The copy handler lives inside the section's onContextMenu, so a render test
 * cannot reach it: the native menu is drawn by the main process. The wiring is
 * read from the source instead, which is the one thing that broke.
 */
test("a copy the clipboard refused is reported, not passed over in silence", () => {
  const source = readFileSync(join(import.meta.dir, "ReviewFiles.tsx"), "utf8");

  // copyText resolves on a refusal, which is how Copy path failed with no
  // message at all. Every menu copy goes through the reporting wrapper.
  assert.doesNotMatch(source, /\bcopyText\(/);
  assert.match(source, /await copyTextOrFail\(value\)/);
  assert.match(source, /setMenuError\("The clipboard refused this copy\."\)/);

  const copies = [...source.matchAll(/case "copy-[a-z-]+": await ([A-Za-z]+)\(/g)].map((match) => match[1]);
  assert.equal(copies.length, 4);
  assert.deepEqual([...new Set(copies)], ["copyFromMenu"]);
});

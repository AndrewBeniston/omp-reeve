import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [globals, tokens] = await Promise.all([
  readFile(new URL("./globals.css", import.meta.url), "utf8"),
  readFile(new URL("./tokens.css", import.meta.url), "utf8"),
]);

test("rounded rectangles use the Codex superellipse by default", () => {
  assert.match(tokens, /--corner-row:\s*superellipse\(1\.5\);/);
  assert.match(globals, /@supports \(corner-shape: superellipse\(1\.5\)\)\s*\{[\s\S]*?:where\(\*, \*::before, \*::after\)\s*\{[^}]*corner-shape:\s*var\(--corner-row\);/);
});

test("circles and pills retain the round Codex shape", () => {
  assert.match(tokens, /--corner-round:\s*round;/);
  assert.match(globals, /\.chat-session-scroll::-webkit-scrollbar-thumb\s*\{[^}]*corner-shape:\s*var\(--corner-round\);/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Extension widgets arrive as terminal lines with 24-bit colour codes. The
// widget body must print the text without the escape sequences (#569).
test("extension widget lines are printed without ANSI colour codes", async () => {
  const source = await readFile(new URL("./ChatWindow.tsx", import.meta.url), "utf8");
  const body = source.match(/function ExtensionWidgets[\s\S]*?<\/pre>/)?.[0] ?? "";
  assert.match(body, /stripAnsi\(widget\.lines\.join\("\\n"\)\)/);
  const { stripAnsi } = await import("../lib/ansi.ts");
  assert.equal(stripAnsi("\u001b[38;2;125;207;255mSession: \u001b[39m0.0%"), "Session: 0.0%");
});
